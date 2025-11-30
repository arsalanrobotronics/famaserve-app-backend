var express = require("express");
var router = express.Router();

const ChatController = require("../../controllers/Chat/ChatController");

const Authenticate = require("../../middlewares/authenticate");

router.post("/create", Authenticate, ChatController.createChat);

router.get("/my-chats", Authenticate, ChatController.getUserChats);

router.get("/project/:projectId/chats", Authenticate, ChatController.getProjectChats);

router.get("/project-chats", Authenticate, ChatController.getProjectChatsByQuery);

router.get("/:chatId", Authenticate, ChatController.getChatById);

router.get("/stats/overview", Authenticate, ChatController.getChatStats);

router.post("/:chatId/messages", Authenticate, ChatController.sendMessage);

router.get("/:chatId/messages", Authenticate, ChatController.getChatMessages);

router.patch("/:chatId/messages/read", Authenticate, ChatController.markMessagesAsRead);

router.patch("/messages/:messageId/edit", Authenticate, ChatController.editMessage);

router.delete("/messages/:messageId", Authenticate, ChatController.deleteMessage);

module.exports = router;
