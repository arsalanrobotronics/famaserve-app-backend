const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

const ChatModel = require("../../models/Chat");
const MessageModel = require("../../models/Message");
const CustomerModel = require("../../models/Customers");
const { notify } = require("../../services/notificationService");

const activeUsers = new Map();
const userSockets = new Map();

function initializeSocketIO(io) {

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token) {
        return next(new Error("No authentication token provided"));
      }

      const cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;

      const decoded = jwt.verify(cleanToken, process.env.CLIENT_SECRET);

      const user = await CustomerModel.findById(decoded.userId).populate("role");
      if (!user) {
        return next(new Error("User not found"));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      console.log("Socket authentication failed:", error);
      return next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`Client ${socket.userId} linked via ${socket.id}`);

    activeUsers.set(socket.userId, {
      socketId: socket.id,
      status: "online",
      lastSeen: new Date(),
    });
    userSockets.set(socket.id, socket.userId);

    socket.join(`user_${socket.userId}`);

    broadcastUserStatus(io, socket.userId, "online");

    socket.on("join_chat", async (data) => {
      try {
        const { chatId } = data;
        
        console.log(`🔔 Client ${socket.userId} requesting to join chat: ${chatId}`);
        
        if (!ObjectId.isValid(chatId)) {
          console.log(`❌ Invalid chat ID: ${chatId}`);
          socket.emit("error", { message: "Invalid chat ID" });
          return;
        }

        const chat = await ChatModel.findOne({
          _id: chatId,
          $or: [{ tradieId: new ObjectId(socket.userId) }, { builderId: new ObjectId(socket.userId) }],
        });

        if (!chat) {
          console.log(`❌ Chat not found or access denied for user ${socket.userId}`);
          socket.emit("error", { message: "Chat not found or access denied" });
          return;
        }

        socket.join(`chat_${chatId}`);
        socket.emit("joined_chat", { chatId });
        
        console.log(`✅ Client ${socket.userId} joined room: chat_${chatId}`);
        console.log(`👥 Room chat_${chatId} now has ${io.sockets.adapter.rooms.get(`chat_${chatId}`)?.size || 0} members`);
      } catch (error) {
        console.log("❌ Join chat process failed:", error);
        socket.emit("error", { message: "Something went wrong, please try again later." });
      }
    });

    socket.on("leave_chat", (data) => {
      const { chatId } = data;
      socket.leave(`chat_${chatId}`);
      socket.emit("left_chat", { chatId });
      console.log(`Client ${socket.userId} exited session ${chatId}`);
    });

    socket.on("send_message", async (data) => {
      try {
        const {
          chatId,
          messageType = "text",
          content,
          documentUrl,
          documentName,
          documentSize,
        } = data;

        console.log(`📨 Received send_message from ${socket.userId}:`, data);

        if (!ObjectId.isValid(chatId)) {
          socket.emit("error", { message: "Invalid chat ID" });
          return;
        }

        const chat = await ChatModel.findOne({
          _id: chatId,
          $or: [{ tradieId: new ObjectId(socket.userId) }, { builderId: new ObjectId(socket.userId) }],
        });

        if (!chat) {
          socket.emit("error", { message: "Chat not found or access denied" });
          return;
        }

        if (messageType === "text" && !content) {
          socket.emit("error", { message: "Content is required for text messages" });
          return;
        }

        if ((messageType === "document" || messageType === "image") && (!documentUrl || !documentName || !documentSize)) {
          socket.emit("error", { message: "Document URL, name and size are required" });
          return;
        }

        const messageData = {
          chatId,
          senderId: new ObjectId(socket.userId),
          messageType,
        };

        if (messageType === "text") {
          messageData.content = content;
        } else {
          messageData.documentUrl = documentUrl;
          messageData.documentName = documentName;
          messageData.documentSize = documentSize;
        }

        const newMessage = new MessageModel(messageData);
        const savedMessage = await newMessage.save();
        console.log(`✅ Message saved to DB:`, savedMessage._id);

        const lastMessageText = messageType === "text" 
          ? content.substring(0, 100) 
          : `Sent a ${messageType}`;

        await ChatModel.findByIdAndUpdate(chatId, {
          lastMessage: lastMessageText,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        });

        await chat.incrementUnreadCount(new ObjectId(socket.userId));

        const populatedMessage = await MessageModel.findById(savedMessage._id)
          .populate("sender", "fullName avatar avatarUrl email companyName");

        // Get chat with participants to determine receiver
        const chatWithParticipants = await ChatModel.findById(chatId)
          .populate("tradie", "fullName avatar avatarUrl email companyName")
          .populate("builder", "fullName avatar avatarUrl email companyName");

        // Add receiver info to message
        const messageWithReceiver = populatedMessage.toObject();
        if (messageWithReceiver.senderId.toString() === chatWithParticipants.tradieId.toString()) {
          messageWithReceiver.receiver = chatWithParticipants.builder;
        } else {
          messageWithReceiver.receiver = chatWithParticipants.tradie;
        }

        console.log(`📤 Broadcasting new_message to room chat_${chatId}`);
        console.log(`📦 Message data:`, JSON.stringify(messageWithReceiver, null, 2));
        
        io.to(`chat_${chatId}`).emit("new_message", messageWithReceiver);

        // Also emit to sender for confirmation
        socket.emit("message_sent", { 
          success: true, 
          message: messageWithReceiver 
        });

        const otherUserId = chat.getOtherParticipant(new ObjectId(socket.userId));
        const otherUserStatus = activeUsers.get(otherUserId.toString());
        
        // Send push notification to receiver (fire-and-forget)
        (async () => {
          try {
            console.log(`🔔 Sending push notification to ${otherUserId}`);
            
            // Get project details for context
            const project = await require("../../models/Projects").findById(chat.projectId).select("title").lean();
            const sender = await CustomerModel.findById(socket.userId).select("fullName").lean();
            
            await notify({
              type: "message_sent",
              recipientId: otherUserId,
              senderId: socket.userId,
              projectId: chat.projectId,
              chatId: chatId,
              meta: { 
                projectTitle: project?.title || "", 
                senderName: sender?.fullName || "" 
              },
            });
            
            console.log(`✅ Push notification sent to ${otherUserId}`);
          } catch (e) {
            console.log(`❌ Push notification failed for ${otherUserId}:`, e?.message);
          }
        })();

        console.log(`✅ Message sent successfully in chat ${chatId}`);
      } catch (error) {
        console.log("❌ Send message process failed:", error);
        socket.emit("error", { message: "Something went wrong, please try again later." });
      }
    });

    socket.on("typing_start", (data) => {
      const { chatId } = data;
      socket.to(`chat_${chatId}`).emit("user_typing", {
        userId: socket.userId,
        userName: socket.user.fullName,
        isTyping: true,
      });
    });

    socket.on("typing_stop", (data) => {
      const { chatId } = data;
      socket.to(`chat_${chatId}`).emit("user_typing", {
        userId: socket.userId,
        userName: socket.user.fullName,
        isTyping: false,
      });
    });

    // Recipient acknowledges message delivered (double tick)
    socket.on("message_delivered", async (data) => {
      try {
        const { chatId, messageId } = data || {};
        if (!ObjectId.isValid(chatId) || !ObjectId.isValid(messageId)) {
          console.log("❌ message_delivered invalid IDs:", { chatId, messageId });
          socket.emit("error", { message: "Invalid chat or message ID" });
          return;
        }

        const chat = await ChatModel.findOne({
          _id: chatId,
          $or: [{ tradieId: new ObjectId(socket.userId) }, { builderId: new ObjectId(socket.userId) }],
        });

        if (!chat) {
          console.log(`❌ message_delivered chat not found or access denied for user ${socket.userId}`);
          socket.emit("error", { message: "Chat not found or access denied" });
          return;
        }

        io.to(`chat_${chatId}`).emit("message_status_update", {
          chatId,
          messageId,
          messageIds: [messageId.toString()], // ✅ Added for consistency
          status: "delivered",
          deliveredAt: new Date(),
          timestamp: new Date().toISOString(), // ✅ Added timestamp
          byUserId: socket.userId,
        });

        console.log(`✅ message_delivered broadcast for message ${messageId} in chat ${chatId}`);
      } catch (error) {
        console.log("❌ message_delivered process failed:", error);
        socket.emit("error", { message: "Something went wrong, please try again later." });
      }
    });

    // Recipient marks a single message as read (blue ticks)
    socket.on("message_read", async (data) => {
      try {
        const { chatId, messageId } = data || {};
        if (!ObjectId.isValid(chatId) || !ObjectId.isValid(messageId)) {
          console.log("❌ message_read invalid IDs:", { chatId, messageId });
          socket.emit("error", { message: "Invalid chat or message ID" });
          return;
        }

        const chat = await ChatModel.findOne({
          _id: chatId,
          $or: [{ tradieId: new ObjectId(socket.userId) }, { builderId: new ObjectId(socket.userId) }],
        });

        if (!chat) {
          console.log(`❌ message_read chat not found or access denied for user ${socket.userId}`);
          socket.emit("error", { message: "Chat not found or access denied" });
          return;
        }

        // Only mark as read if current user is recipient
        const updateResult = await MessageModel.findOneAndUpdate(
          { _id: messageId, chatId: chatId, senderId: { $ne: new ObjectId(socket.userId) }, isRead: false, isDeleted: false },
          { $set: { isRead: true, readAt: new Date(), updatedAt: new Date() } },
          { new: true }
        );

        if (updateResult) {
          // ✅ Notify all users in the chat about the read status
          io.to(`chat_${chatId}`).emit("message_status_update", {
            chatId,
            messageId,
            messageIds: [messageId.toString()], // ✅ Added messageIds array
            status: "read",
            readAt: new Date(),
            timestamp: new Date().toISOString(), // ✅ Added timestamp
            byUserId: socket.userId,
          });

          console.log(`✅ message_read broadcast for message ${messageId} in chat ${chatId}`);
        } else {
          console.log(`⚠️ Message ${messageId} not found or already read`);
        }

      } catch (error) {
        console.log("❌ message_read process failed:", error);
        socket.emit("error", { message: "Something went wrong, please try again later." });
      }
    });

    // ✅ FIXED: mark_messages_read handler with messageIds and timestamp
    socket.on("mark_messages_read", async (data) => {
      try {
        const { chatId } = data;

        if (!ObjectId.isValid(chatId)) {
          socket.emit("error", { message: "Invalid chat ID" });
          return;
        }

        const chat = await ChatModel.findOne({
          _id: chatId,
          $or: [{ tradieId: new ObjectId(socket.userId) }, { builderId: new ObjectId(socket.userId) }],
        });

        if (!chat) {
          socket.emit("error", { message: "Chat not found or access denied" });
          return;
        }

        // ✅ Get unread messages BEFORE marking as read to capture messageIds
        const unreadMessages = await MessageModel.find({
          chatId: chatId,
          senderId: { $ne: new ObjectId(socket.userId) },
          isRead: false,
          isDeleted: false
        }).select('_id').lean();

        const messageIds = unreadMessages.map(msg => msg._id.toString());

        // Mark messages as read
        await MessageModel.markAsRead(chatId, new ObjectId(socket.userId));

        // Reset unread count
        await chat.resetUnreadCount(new ObjectId(socket.userId));

        const timestamp = new Date().toISOString();

        // ✅ Notify the SENDER (other user) with messageIds
        socket.to(`chat_${chatId}`).emit("messages_read", {
          chatId,
          messageIds: messageIds, // ✅ Added messageIds array
          readByUserId: socket.userId,
          readAt: new Date(),
          timestamp: timestamp, // ✅ Added timestamp
        });

        // ✅ Confirm to the user who marked messages as read
        socket.emit("messages_marked_read", { 
          chatId,
          messageIds: messageIds, // ✅ Added for consistency
          timestamp: timestamp // ✅ Added timestamp
        });

        console.log(`✅ Messages marked as read in chat ${chatId} by ${socket.userId}. Notified ${messageIds.length} messages.`);

      } catch (error) {
        console.log("❌ Mark messages read process failed:", error);
        socket.emit("error", { message: "Something went wrong, please try again later." });
      }
    });

    socket.on("update_status", (data) => {
      const { status } = data;
      if (["online", "away", "busy"].includes(status)) {
        activeUsers.set(socket.userId, {
          ...activeUsers.get(socket.userId),
          status,
          lastSeen: new Date(),
        });
        broadcastUserStatus(io, socket.userId, status);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`Client ${socket.userId} terminated: ${reason}`);

      const userStatus = activeUsers.get(socket.userId);
      if (userStatus) {
        activeUsers.set(socket.userId, {
          ...userStatus,
          status: "offline",
          lastSeen: new Date(),
        });
      }

      userSockets.delete(socket.id);

      broadcastUserStatus(io, socket.userId, "offline");
    });

    socket.emit("online_users", getOnlineUsersList());
  });
}

async function broadcastUserStatus(io, userId, status) {
  try {
    const userObjectId = new ObjectId(userId);
    const userChats = await ChatModel.find({
      $or: [{ tradieId: userObjectId }, { builderId: userObjectId }],
      status: "active",
    });

    userChats.forEach(chat => {
      io.to(`chat_${chat._id}`).emit("user_status_update", {
        userId,
        status,
        timestamp: new Date(),
      });
    });
  } catch (error) {
    console.log("Broadcast user status failed:", error);
  }
}

function getOnlineUsersList() {
  const onlineUsers = [];
  activeUsers.forEach((userStatus, userId) => {
    if (userStatus.status === "online") {
      onlineUsers.push({
        userId,
        status: userStatus.status,
        lastSeen: userStatus.lastSeen,
      });
    }
  });
  return onlineUsers;
}

function sendToUser(io, userId, event, data) {
  io.to(`user_${userId}`).emit(event, data);
}

function sendToChat(io, chatId, event, data) {
  io.to(`chat_${chatId}`).emit(event, data);
}

function getUserStatus(userId) {
  return activeUsers.get(userId) || null;
}

module.exports = {
  initializeSocketIO,
  sendToUser,
  sendToChat,
  getUserStatus,
  getOnlineUsersList,
};