const Notification = require("../../models/Notification");
const sanitize = require("mongo-sanitize");
const logger = require("../../helpers/logger").child({ module: "Notifications" });
const { sendResponse, checkKeysExist } = require("../../helpers/utils");

module.exports = {
  getAll,
  getById,
  markAsRead,
  markAllRead,
  remove,
};

async function getAll(request, response) {
  try {
    const userId = request?.user?._id;
    const { page = 1, limit = 20, onlyUnread, isRead } = request.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const base = { recipientId: userId, status: "active" };
    const query = { ...base };
    if (String(onlyUnread) === "true") query.isRead = false;
    if (typeof isRead !== "undefined") {
      if (String(isRead) === "true") query.isRead = true;
      if (String(isRead) === "false") query.isRead = false;
    }

    const [itemsRaw, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate({
          path: "senderId",
          select: "fullName email phoneNumber avatar avatarUrl companyName",
        })
        .populate({
          path: "recipientId",
          select: "fullName email phoneNumber avatar avatarUrl companyName",
        })
        .lean(),
      Notification.countDocuments(query),
    ]);

    const items = (itemsRaw || []).map((n) => {
      const senderPop = n.senderId && typeof n.senderId === "object" ? n.senderId : null;
      const recipientPop = n.recipientId && typeof n.recipientId === "object" ? n.recipientId : null;
      const formatted = {
        ...n,
        sender: senderPop
          ? {
              _id: senderPop._id,
              fullName: senderPop.fullName || null,
              email: senderPop.email || null,
              phoneNumber: senderPop.phoneNumber || null,
              avatar: senderPop.avatar || null,
              avatarUrl: senderPop.avatarUrl || null,
              companyName: senderPop.companyName || null,
            }
          : null,
        recipient: recipientPop
          ? {
              _id: recipientPop._id,
              fullName: recipientPop.fullName || null,
              email: recipientPop.email || null,
              phoneNumber: recipientPop.phoneNumber || null,
              avatar: recipientPop.avatar || null,
              avatarUrl: recipientPop.avatarUrl || null,
              companyName: recipientPop.companyName || null,
            }
          : null,
        senderId: senderPop ? senderPop._id : n.senderId || null,
        recipientId: recipientPop ? recipientPop._id : n.recipientId || null,
      };
      delete formatted.senderId?.fullName; // safety in case not lean
      delete formatted.recipientId?.fullName;
      return formatted;
    });

    const payload = {
      notifications: items,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        total,
        hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrev: parseInt(page) > 1,
      },
    };

    return sendResponse(response, "Notifications", 200, 1, "Notifications fetched", payload);
  } catch (error) {
    logger.error("getAll failed", { error: error?.message });
    return sendResponse(response, "Notifications", 500, 0, "Something went wrong");
  }
}

async function getById(request, response) {
  try {
    const userId = request?.user?._id;
    const { id } = request.params;
    const raw = await Notification.findOne({ _id: id, recipientId: userId, status: "active" })
      .populate({ path: "senderId", select: "fullName email phoneNumber avatar avatarUrl companyName" })
      .populate({ path: "recipientId", select: "fullName email phoneNumber avatar avatarUrl companyName" })
      .lean();
    if (!raw) return sendResponse(response, "Notifications", 422, 0, "Notification not found");
    const senderPop = raw.senderId && typeof raw.senderId === "object" ? raw.senderId : null;
    const recipientPop = raw.recipientId && typeof raw.recipientId === "object" ? raw.recipientId : null;
    const item = {
      ...raw,
      sender: senderPop
        ? {
            _id: senderPop._id,
            fullName: senderPop.fullName || null,
            email: senderPop.email || null,
            phoneNumber: senderPop.phoneNumber || null,
            avatar: senderPop.avatar || null,
            avatarUrl: senderPop.avatarUrl || null,
            companyName: senderPop.companyName || null,
          }
        : null,
      recipient: recipientPop
        ? {
            _id: recipientPop._id,
            fullName: recipientPop.fullName || null,
            email: recipientPop.email || null,
            phoneNumber: recipientPop.phoneNumber || null,
            avatar: recipientPop.avatar || null,
            avatarUrl: recipientPop.avatarUrl || null,
            companyName: recipientPop.companyName || null,
          }
        : null,
      senderId: senderPop ? senderPop._id : raw.senderId || null,
      recipientId: recipientPop ? recipientPop._id : raw.recipientId || null,
    };
    return sendResponse(response, "Notifications", 200, 1, "Notification fetched", item);
  } catch (error) {
    logger.error("getById failed", { error: error?.message });
    return sendResponse(response, "Notifications", 500, 0, "Something went wrong");
  }
}

async function markAsRead(request, response) {
  try {
    const userId = request?.user?._id;
    const { id } = request.params;

    const updatedRaw = await Notification.findOneAndUpdate(
      { _id: id, recipientId: userId },
      { $set: { isRead: true, updatedAt: new Date() } },
      { new: true }
    )
      .populate({ path: "senderId", select: "fullName email phoneNumber avatar avatarUrl companyName" })
      .populate({ path: "recipientId", select: "fullName email phoneNumber avatar avatarUrl companyName" })
      .lean();
    if (!updatedRaw) return sendResponse(response, "Notifications", 422, 0, "Notification not found");
    const senderPop = updatedRaw.senderId && typeof updatedRaw.senderId === "object" ? updatedRaw.senderId : null;
    const recipientPop = updatedRaw.recipientId && typeof updatedRaw.recipientId === "object" ? updatedRaw.recipientId : null;
    const updated = {
      ...updatedRaw,
      sender: senderPop
        ? {
            _id: senderPop._id,
            fullName: senderPop.fullName || null,
            email: senderPop.email || null,
            phoneNumber: senderPop.phoneNumber || null,
            avatar: senderPop.avatar || null,
            avatarUrl: senderPop.avatarUrl || null,
            companyName: senderPop.companyName || null,
          }
        : null,
      recipient: recipientPop
        ? {
            _id: recipientPop._id,
            fullName: recipientPop.fullName || null,
            email: recipientPop.email || null,
            phoneNumber: recipientPop.phoneNumber || null,
            avatar: recipientPop.avatar || null,
            avatarUrl: recipientPop.avatarUrl || null,
            companyName: recipientPop.companyName || null,
          }
        : null,
      senderId: senderPop ? senderPop._id : updatedRaw.senderId || null,
      recipientId: recipientPop ? recipientPop._id : updatedRaw.recipientId || null,
    };
    return sendResponse(response, "Notifications", 200, 1, "Notification marked read", updated);
  } catch (error) {
    logger.error("markAsRead failed", { error: error?.message });
    return sendResponse(response, "Notifications", 500, 0, "Something went wrong");
  }
}

async function markAllRead(request, response) {
  try {
    const userId = request?.user?._id;
    await Notification.updateMany({ recipientId: userId, isRead: false }, { $set: { isRead: true, updatedAt: new Date() } });
    return sendResponse(response, "Notifications", 200, 1, "All notifications marked read", {});
  } catch (error) {
    logger.error("markAllRead failed", { error: error?.message });
    return sendResponse(response, "Notifications", 500, 0, "Something went wrong");
  }
}

async function remove(request, response) {
  try {
    const userId = request?.user?._id;
    const { id } = request.params;
    const deleted = await Notification.findOneAndUpdate(
      { _id: id, recipientId: userId },
      { $set: { status: "inactive", updatedAt: new Date() } },
      { new: true }
    );
    if (!deleted) return sendResponse(response, "Notifications", 422, 0, "Notification not found");
    return sendResponse(response, "Notifications", 200, 1, "Notification deleted", {});
  } catch (error) {
    logger.error("remove failed", { error: error?.message });
    return sendResponse(response, "Notifications", 500, 0, "Something went wrong");
  }
}


