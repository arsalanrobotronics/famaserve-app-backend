// const mongoose = require("mongoose");
// const moment = require("moment");
// const ObjectId = mongoose.Types.ObjectId;
// const sanitize = require("mongo-sanitize");

// const ChatModel = require("../../models/Chat");
// const MessageModel = require("../../models/Message");
// const CustomerModel = require("../../models/Customers");
// const ProjectModel = require("../../models/Projects");
// const RoleModel = require("../../models/Role");

// // const systemLogsHelper = require("../../helpers/system-logs");
// const {
//   sendResponse,
//   checkKeysExist,
// } = require("../../helpers/utils");

// const moduleName = "Chat";
// const { notify } = require("../../services/notificationService");
// var lang = "english";
// var channel = "web";

// module.exports = {
//   createChat,
//   getUserChats,
//   getProjectChats,
//   getProjectChatsByQuery,
//   getChatById,
//   sendMessage,
//   getChatMessages,
//   markMessagesAsRead,
//   deleteMessage,
//   editMessage,
//   getChatStats,
// };

// async function createChat(request, response) {
//   try {
//     const {
//       projectId,
//       tradieId,
//       builderId,
//     } = request.body;

//     const sanitizedData = {
//       projectId: sanitize(projectId),
//       tradieId: sanitize(tradieId),
//       builderId: sanitize(builderId),
//     };

//     const requiredFields = ["projectId", "tradieId", "builderId"];
//     const missingFields = checkKeysExist(sanitizedData, requiredFields);
//     if (missingFields > 0) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Required fields are missing",
//         {
//           missingFields,
//         }
//       );
//     }

//     if (!ObjectId.isValid(sanitizedData.projectId) || 
//         !ObjectId.isValid(sanitizedData.tradieId) || 
//         !ObjectId.isValid(sanitizedData.builderId)) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Invalid ID",
//         {},
//       );
//     }

//     const project = await ProjectModel.findById(sanitizedData.projectId);
//     if (!project) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Project not found",
//         {},
//       );
//     }

//     const [tradie, builder] = await Promise.all([
//       CustomerModel.findById(sanitizedData.tradieId).populate("role"),
//       CustomerModel.findById(sanitizedData.builderId).populate("role"),
//     ]);

//     if (!tradie || !builder) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "User not found",
//         {},
//       );
//     }

//     if (tradie.role.title !== "Tradie") {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "User is not a tradie",
//         {},
//       );
//     }

//     if (builder.role.title !== "Builder") {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "User is not a builder",
//         {},
//       );
//     }

//     const existingChat = await ChatModel.findOne({
//       projectId: sanitizedData.projectId,
//       tradieId: sanitizedData.tradieId,
//       builderId: sanitizedData.builderId,
//     });

//     if (existingChat) {
//       return sendResponse(
//         response,
//         moduleName,
//         200,
//         1,
//         "Chat already exists",
//         existingChat,
//       );
//     }

//     const newChat = new ChatModel({
//       projectId: sanitizedData.projectId,
//       tradieId: sanitizedData.tradieId,
//       builderId: sanitizedData.builderId,
//     });

//     const savedChat = await newChat.save();

//     const populatedChat = await ChatModel.findById(savedChat._id)
//       .populate("project", "title description status")
//       .populate("tradie", "fullName avatar avatarUrl companyName")
//       .populate("builder", "fullName avatar avatarUrl companyName");

//     // await systemLogsHelper.createSystemLogs(request.user, {
//     //   module: moduleName,
//     //   action: "chat_created",
//     //   details: `Chat created for project: ${project.title}`,
//     // });

//     return sendResponse(
//       response,
//       moduleName,
//       201,
//       1,
//       "Chat created",
//       populatedChat,
//     );

//     // Fire-and-forget notifications
//     (async () => {
//       try {
//         const proj = populatedChat?.project;
//         await Promise.all([
//           notify({
//             type: "chat_created",
//             recipientId: populatedChat.tradieId,
//             senderId: request.user?._id || null,
//             projectId: proj?._id,
//             chatId: populatedChat._id,
//             meta: { projectTitle: proj?.title || "" },
//           }),
//           notify({
//             type: "chat_created",
//             recipientId: populatedChat.builderId,
//             senderId: request.user?._id || null,
//             projectId: proj?._id,
//             chatId: populatedChat._id,
//             meta: { projectTitle: proj?.title || "" },
//           }),
//         ]);
//         console.log("chat_created notifications enqueued", {
//           chatId: populatedChat._id?.toString(),
//         });
//       } catch (e) {
//         console.log("chat_created notifications failed", e?.message);
//       }
//     })();

//   } catch (error) {
//     console.log("Create chat process failed:", error);
//     return sendResponse(
//       response,
//       moduleName,
//       500,
//       0,
//       "Something went wrong, please try again later."
//     );
//   }
// }

// async function getUserChats(request, response) {
//   try {
//     const userId = request.user._id;
//     const { status = "active", page = 1, limit = 20, projectId } = request.query;

//     const pageNumber = parseInt(page);
//     const limitNumber = parseInt(limit);
//     const skip = (pageNumber - 1) * limitNumber;

//     // Build query based on parameters
//     const query = {
//       $or: [{ tradieId: userId }, { builderId: userId }],
//       status: sanitize(status),
//     };

//     // Add projectId filter if provided
//     if (projectId) {
//       if (!ObjectId.isValid(projectId)) {
//         return sendResponse(
//           response,
//           moduleName,
//           422,
//           0,
//           "Invalid project ID",
//           {},
//         );
//       }
//       query.projectId = projectId;
//     }

//     const chats = await ChatModel.find(query)
//     .populate("project", "title description status")
//     .populate("tradie", "fullName avatar avatarUrl companyName")
//     .populate("builder", "fullName avatar avatarUrl companyName")
//     .sort({ lastMessageAt: -1 })
//     .skip(skip)
//     .limit(limitNumber);

//     const totalChats = await ChatModel.countDocuments(query);

//     const responseponse = {
//       chats,
//       pagination: {
//         currentPage: pageNumber,
//         totalPages: Math.ceil(totalChats / limitNumber),
//         totalChats,
//         hasNext: pageNumber < Math.ceil(totalChats / limitNumber),
//         hasPrev: pageNumber > 1,
//       },
//     };

//     return sendResponse(
//       response,
//       moduleName,
//       200,
//       1,
//       "Chat list success",
//       responseponse,
//     );

//   } catch (error) {
//     console.log("Get user chats process failed:", error);
//     return sendResponse(
//       response,
//       moduleName,
//       500,
//       0,
//       "Something went wrong, please try again later."
//     );
//   }
// }

// async function getProjectChats(request, response) {
//   try {
//     const { projectId } = request.params;
//     const { status = "active", page = 1, limit = 20 } = request.query;

//     if (!ObjectId.isValid(projectId)) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Invalid ID",
//         {},
//       );
//     }

//     const project = await ProjectModel.findById(projectId);
//     if (!project) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Project not found",
//         {},
//       );
//     }

//     const pageNumber = parseInt(page);
//     const limitNumber = parseInt(limit);
//     const skip = (pageNumber - 1) * limitNumber;

//     const chats = await ChatModel.find({
//       projectId: projectId,
//       status: sanitize(status),
//     })
//     .populate("project", "title description status")
//     .populate("tradie", "fullName avatar avatarUrl companyName")
//     .populate("builder", "fullName avatar avatarUrl companyName")
//     .sort({ lastMessageAt: -1 })
//     .skip(skip)
//     .limit(limitNumber);

//     const totalChats = await ChatModel.countDocuments({
//       projectId: projectId,
//       status: sanitize(status),
//     });

//     const responseponse = {
//       chats,
//       pagination: {
//         currentPage: pageNumber,
//         totalPages: Math.ceil(totalChats / limitNumber),
//         totalChats,
//         hasNext: pageNumber < Math.ceil(totalChats / limitNumber),
//         hasPrev: pageNumber > 1,
//       },
//     };

//     return sendResponse(
//       response,
//       moduleName,
//       200,
//       1,
//       "Project chat list success",
//       responseponse,
//     );

//   } catch (error) {
//     console.log("Get project chats process failed:", error);
//     return sendResponse(
//       response,
//       moduleName,
//       500,
//       0,
//       "Something went wrong, please try again later."
//     );
//   }
// }

// async function getProjectChatsByQuery(request, response) {
//   try {
//     const { projectId, tradieId, builderId, status } = request.query;

//     if (!ObjectId.isValid(projectId)) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Invalid project ID",
//         {},
//       );
//     }

//     if (tradieId && !ObjectId.isValid(tradieId)) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Invalid tradie ID",
//         {},
//       );
//     }

//     if (builderId && !ObjectId.isValid(builderId)) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Invalid builder ID",
//         {},
//       );
//     }

//     const project = await ProjectModel.findById(projectId);
//     if (!project) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Project not found",
//         {},
//       );
//     }

//     const query = {};
//     if (projectId) query.projectId = projectId;
//     if (tradieId) query.tradieId = tradieId;
//     if (builderId) query.builderId = builderId;
//     if (status) query.status = sanitize(status);

//     const chats = await ChatModel.find(query)
//       .populate("project", "title description status")
//       .populate("tradie", "fullName avatar avatarUrl companyName")
//       .populate("builder", "fullName avatar avatarUrl companyName")
//       .sort({ lastMessageAt: -1 });

//     const totalChats = await ChatModel.countDocuments(query);

//     const responseponse = {
//       chats,
//       pagination: {
//         currentPage: 1, // This is a query-specific endpoint, so no pagination
//         totalPages: 1,
//         totalChats,
//         hasNext: false,
//         hasPrev: false,
//       },
//     };

//     return sendResponse(
//       response,
//       moduleName,
//       200,
//       1,
//       "Project chat list by query success",
//       responseponse,
//     );

//   } catch (error) {
//     console.log("Get project chats by query process failed:", error);
//     return sendResponse(
//       response,
//       moduleName,
//       500,
//       0,
//       "Something went wrong, please try again later."
//     );
//   }
// }

// async function getChatById(request, response) {
//   try {
//     const { chatId } = request.params;
//     const userId = request.user._id;

//     if (!ObjectId.isValid(chatId)) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Invalid ID",
//         {},
//       );
//     }

//     const chat = await ChatModel.findOne({
//       _id: chatId,
//       $or: [{ tradieId: userId }, { builderId: userId }],
//     })
//     .populate("project", "title description status")
//     .populate("tradie", "fullName avatar avatarUrl companyName")
//     .populate("builder", "fullName avatar avatarUrl companyName");

//     if (!chat) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Chat not found",
//         {},
//       );
//     }

//     return sendResponse(
//       response,
//       moduleName,
//       200,
//       1,
//       "Chat found",
//       chat,
//     );

//   } catch (error) {
//     console.log("Get chat by ID process failed:", error);
//     return sendResponse(
//       response,
//       moduleName,
//       500,
//       0,
//       "Something went wrong, please try again later."
//     );
//   }
// }

// async function sendMessage(request, response) {
//   try {
//     const { chatId } = request.params;
//     const {
//       messageType = "text",
//       content,
//       documentUrl,
//       documentName,
//       documentSize,
//     } = request.body;

//     const userId = request.user._id;

//     if (!ObjectId.isValid(chatId)) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Invalid ID",
//         {},
//       );
//     }

//     const chat = await ChatModel.findOne({
//       _id: chatId,
//       $or: [{ tradieId: userId }, { builderId: userId }],
//     });

//     if (!chat) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Chat not found",
//         {},
//       );
//     }

//     if (messageType === "text" && !content) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Content is required for text messages",
//         {},
//       );
//     }

//     if ((messageType === "document" || messageType === "image") && (!documentUrl || !documentName)) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Document URL and name are required for document/image messages",
//         {},
//       );
//     }

//     const messageData = {
//       chatId,
//       senderId: userId,
//       messageType: sanitize(messageType),
//     };

//     if (messageType === "text") {
//       messageData.content = sanitize(content);
//     } else {
//       messageData.documentUrl = sanitize(documentUrl);
//       messageData.documentName = sanitize(documentName);
//       messageData.documentSize = sanitize(documentSize);
//     }

//     const newMessage = new MessageModel(messageData);
//     const savedMessage = await newMessage.save();

//     const lastMessageText = messageType === "text" 
//       ? content.substring(0, 100) 
//       : `Sent a ${messageType}`;

//     await ChatModel.findByIdAndUpdate(chatId, {
//       lastMessage: lastMessageText,
//       lastMessageAt: new Date(),
//       updatedAt: new Date(),
//     });

//     await chat.incrementUnreadCount(userId);

//     const populatedMessage = await MessageModel.findById(savedMessage._id)
//       .populate("sender", "fullName avatar avatarUrl");

//     return sendResponse(
//       response,
//       moduleName,
//       201,
//       1,
//       "Message sent",
//       populatedMessage,
//     );

//     // Fire-and-forget notification to the receiver
//     (async () => {
//       try {
//         const otherUserId = String(chat.tradieId) === String(userId) ? chat.builderId : chat.tradieId;
//         const project = await ProjectModel.findById(chat.projectId).select("title").lean();
//         const sender = await CustomerModel.findById(userId).select("fullName").lean();
//         await notify({
//           type: "message_sent",
//           recipientId: otherUserId,
//           senderId: userId,
//           projectId: chat.projectId,
//           chatId: chatId,
//           meta: { projectTitle: project?.title || "", senderName: sender?.fullName || "" },
//         });
//         console.log("message_sent notification enqueued", { chatId: chatId?.toString(), to: otherUserId?.toString() });
//       } catch (e) {
//         console.log("message_sent notification failed", e?.message);
//       }
//     })();

//   } catch (error) {
//     console.log("Send message process failed:", error);
//     return sendResponse(
//       response,
//       moduleName,
//       500,
//       0,
//       "Something went wrong, please try again later."
//     );
//   }
// }

// async function getChatMessages(request, response) {
//   try {
//     const { chatId } = request.params;
//     const { page = 1, limit = 50 } = request.query;
//     const userId = request.user._id;

//     if (!ObjectId.isValid(chatId)) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Invalid ID",
//         {},
//       );
//     }

//     const chat = await ChatModel.findOne({
//       _id: chatId,
//       $or: [{ tradieId: userId }, { builderId: userId }],
//     })
//     .populate("tradie", "fullName avatar avatarUrl email companyName")
//     .populate("builder", "fullName avatar avatarUrl email companyName");

//     if (!chat) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Chat not found",
//         {},
//       );
//     }

//     const pageNumber = parseInt(page);
//     const limitNumber = parseInt(limit);

//     const messages = await MessageModel.findChatMessages(chatId, pageNumber, limitNumber);

//     const totalMessages = await MessageModel.countDocuments({
//       chatId: chatId,
//       isDeleted: false,
//     });

//     // Add receiver info to each message
//     const messagesWithReceiver = messages.map(message => {
//       const messageObj = message.toObject();
      
//       // Determine receiver: if sender is tradie, receiver is builder and vice versa
//       if (messageObj.senderId.toString() === chat.tradieId.toString()) {
//         messageObj.receiver = chat.builder;
//       } else {
//         messageObj.receiver = chat.tradie;
//       }
      
//       return messageObj;
//     });

//     const responseponse = {
//       messages: messagesWithReceiver.reverse(),
//       chat: {
//         _id: chat._id,
//         tradie: chat.tradie,
//         builder: chat.builder,
//       },
//       pagination: {
//         currentPage: pageNumber,
//         totalPages: Math.ceil(totalMessages / limitNumber),
//         totalMessages,
//         hasNext: pageNumber < Math.ceil(totalMessages / limitNumber),
//         hasPrev: pageNumber > 1,
//       },
//     };

//     return sendResponse(
//       response,
//       moduleName,
//       200,
//       1,
//       "Chat messages list success",
//       responseponse,
//     );

//   } catch (error) {
//     console.log("Get chat messages process failed:", error);
//     return sendResponse(
//       response,
//       moduleName,
//       500,
//       0,
//       "Something went wrong, please try again later."
//     );
//   }
// }

// async function markMessagesAsRead(request, response) {
//   try {
//     const { chatId } = request.params;
//     const userId = request.user._id;

//     if (!ObjectId.isValid(chatId)) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Invalid ID",
//         {},
//       );
//     }

//     const chat = await ChatModel.findOne({
//       _id: chatId,
//       $or: [{ tradieId: userId }, { builderId: userId }],
//     });

//     if (!chat) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Chat not found",
//         {},
//       );
//     }

//     await MessageModel.markAsRead(chatId, userId);

//     await chat.resetUnreadCount(userId);

//     return sendResponse(
//       response,
//       moduleName,
//       200,
//       1,
//       "Messages marked as read",
//       {},
//     );

//   } catch (error) {
//     console.log("Mark messages as read process failed:", error);
//     return sendResponse(
//       response,
//       moduleName,
//       500,
//       0,
//       "Something went wrong, please try again later."
//     );
//   }
// }

// async function deleteMessage(request, response) {
//   try {
//     const { messageId } = request.params;
//     const userId = request.user._id;

//     if (!ObjectId.isValid(messageId)) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Invalid ID",
//         {},
//       );
//     }

//     const message = await MessageModel.findOne({
//       _id: messageId,
//       senderId: userId,
//       isDeleted: false,
//     });

//     if (!message) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Message not found",
//         {},
//       );
//     }

//     await message.softDelete();

//     return sendResponse(
//       response,
//       moduleName,
//       200,
//       1,
//       "Message deleted",
//       {},
//     );

//   } catch (error) {
//     console.log("Delete message process failed:", error);
//     return sendResponse(
//       response,
//       moduleName,
//       500,
//       0,
//       "Something went wrong, please try again later."
//     );
//   }
// }

// async function editMessage(request, response) {
//   try {
//     const { messageId } = request.params;
//     const { content } = request.body;
//     const userId = request.user._id;

//     if (!ObjectId.isValid(messageId)) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Invalid ID",
//         {},
//       );
//     }

//     if (!content) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Content is required",
//         {},
//       );
//     }

//     const message = await MessageModel.findOne({
//       _id: messageId,
//       senderId: userId,
//       isDeleted: false,
//       messageType: "text",
//     });

//     if (!message) {
//       return sendResponse(
//         response,
//         moduleName,
//         422,
//         0,
//         "Message not found",
//         {},
//       );
//     }

//     await message.editMessage(sanitize(content));

//     const updatedMessage = await MessageModel.findById(messageId)
//       .populate("sender", "fullName avatar avatarUrl");

//     return sendResponse(
//       response,
//       moduleName,
//       200,
//       1,
//       "Message updated",
//       updatedMessage,
//     );

//   } catch (error) {
//     console.log("Edit message process failed:", error);
//     return sendResponse(
//       response,
//       moduleName,
//       500,
//       0,
//       "Something went wrong, please try again later."
//     );
//   }
// }

// async function getChatStats(request, response) {
//   try {
//     const userId = request.user._id;

//     const totalChats = await ChatModel.countDocuments({
//       $or: [{ tradieId: userId }, { builderId: userId }],
//       status: "active",
//     });

//     const userChats = await ChatModel.find({
//       $or: [{ tradieId: userId }, { builderId: userId }],
//       status: "active",
//     });

//     let totalUnreadMessages = 0;
//     for (const chat of userChats) {
//       totalUnreadMessages += chat.getUnreadCount(userId);
//     }

//     const stats = {
//       totalChats,
//       totalUnreadMessages,
//       activeChats: totalChats,
//     };

//     return sendResponse(
//       response,
//       moduleName,
//       200,
//       1,
//       "Chat stats success",
//       stats,
//     );

//   } catch (error) {
//     console.log("Get chat stats process failed:", error);
//     return sendResponse(
//       response,
//       moduleName,
//       500,
//       0,
//       "Something went wrong, please try again later."
//     );
//   }
// }
