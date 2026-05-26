const cfg = require("../config");
const TG = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// ── Core send functions ──────────────────────────────
async function tg(method, body) {
  const r = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function sendMsg(chatId, text, extra = {}) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown", ...extra });
}

async function sendPhoto(chatId, photo, caption = "") {
  return tg("sendPhoto", { chat_id: chatId, photo, caption, parse_mode: "Markdown" });
}

async function sendVideo(chatId, video, caption = "") {
  return tg("sendVideo", { chat_id: chatId, video, caption, parse_mode: "Markdown" });
}

async function forwardToOwners(text) {
  for (const id of cfg.owners) await sendMsg(id, text);
}

async function forwardPhotoToOwners(fileId, caption) {
  for (const id of cfg.owners) await sendPhoto(id, fileId, caption);
}

// ── Gemini AI reply ──────────────────────────────────
async function geminiReply(history, username) {
  const products = Object.values(cfg.products).map(p =>
    `${p.name}: ${p.price} — ${p.description}`
  ).join("\n");

  const system = `You are Bangladesh Income Hub's smart sales assistant. Always reply in Bangla. Be friendly, use "ভাইজান" and "আপনি". Be concise.

Products:\n${products}
bKash: ${cfg.bkash.number} (${cfg.bkash.name}) — ${cfg.bkash.type}

Rules:
- If client wants to buy → guide to bKash payment → ask for screenshot
- If client asks for video/proof → say owner will send shortly
- If complex issue → say team will contact soon
- Never promise delivery time
- Keep responses short and helpful`;

  const contents = history.map(h => ({
    role: h.role,
    parts: [{ text: h.text }]
  }));
  contents.unshift({ role: "user", parts: [{ text: system }] });
  contents.unshift({ role: "model", parts: [{ text: "Understood. I will follow these instructions." }] });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents })
      }
    );
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "দুঃখিত ভাইজান, একটু সমস্যা হচ্ছে। আবার চেষ্টা করুন।";
  } catch {
    return "দুঃখিত ভাইজান, এই মুহূর্তে reply দিতে পারছি না।";
  }
}

// ── Intent detection ─────────────────────────────────
function detectIntent(text) {
  const t = text.toLowerCase();
  for (const [intent, keywords] of Object.entries(cfg.intents)) {
    if (keywords.some(k => t.includes(k))) return intent;
  }
  return "general";
}

// ── Owner alert with context ─────────────────────────
async function alertOwners(client, text, intent, chatId) {
  const intentLabels = {
    buy: "🛒 WANTS TO BUY",
    video: "🎥 WANTS VIDEO/PROOF",
    support: "🆘 NEEDS SUPPORT",
    greet: "👋 NEW GREETING",
    general: "💬 MESSAGE"
  };
  const label = intentLabels[intent] || "💬 MESSAGE";
  const alert = `${label}\n👤 @${client} (ID: ${chatId})\n📝 "${text}"\n\n↩️ To reply: just reply to THIS message`;
  for (const id of cfg.owners) {
    await tg("sendMessage", {
      chat_id: id,
      text: alert,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "📨 Reply to Client", callback_data: `reply_${chatId}` }
        ]]
      }
    });
  }
}

// ── Commands ─────────────────────────────────────────
async function handleCommand(chatId, cmd, username) {
  const p = Object.values(cfg.products)[0];
  switch (cmd) {
    case "/start":
      await sendMsg(chatId,
        `🌟 *Bangladesh Income Hub* - Welcome ভাইজান!\n\nআমি আপনাকে সাহায্য করতে এখানে আছি।\n\n` +
        `📌 *Menu:*\n/indicator — Indicator details\n/buy — How to buy\n/payment — Payment info\n/products — All products\n/support — Get help`
      );
      await forwardToOwners(`👤 New user started bot: @${username} (${chatId})`);
      break;
    case "/indicator":
      await sendMsg(chatId,
        `📊 *${p.name}*\n\n${p.description}\n\n` +
        p.features.map(f => `✅ ${f}`).join("\n") +
        `\n\n💰 *Price: ${p.price}*\n\nType /buy to purchase ভাইজান।`
      );
      break;
    case "/buy":
      await sendMsg(chatId,
        `🛒 *How to Buy:*\n\n` +
        `1️⃣ Send bKash ${cfg.bkash.type}\n` +
        `📱 Number: *${cfg.bkash.number}*\n` +
        `👤 Name: ${cfg.bkash.name}\n` +
        `💰 Amount: *${p.price}*\n\n` +
        `2️⃣ Send payment screenshot here\n` +
        `3️⃣ We will verify and send indicator ✅`
      );
      break;
    case "/payment":
      await sendMsg(chatId,
        `💳 *Payment Info:*\n\n📱 bKash: *${cfg.bkash.number}*\n👤 ${cfg.bkash.name}\n💰 Type: ${cfg.bkash.type}\n\nSend screenshot after payment ভাইজান।`
      );
      break;
    case "/products":
      const list = Object.values(cfg.products).map(pr =>
        `✅ *${pr.name}* — ${pr.price}`
      ).join("\n");
      await sendMsg(chatId, `🛍️ *Our Products:*\n\n${list}\n\nType /buy to order.`);
      break;
    case "/support":
      await sendMsg(chatId, `🆘 *Support:*\n\nDescribe your issue ভাইজান — our team will help you shortly.`);
      await forwardToOwners(`🆘 Support request from @${username} (${chatId})`);
      break;
  }
}

// ── Conversation history (in-memory) ─────────────────
const conversations = {};

function addToHistory(chatId, role, text) {
  if (!conversations[chatId]) conversations[chatId] = [];
  conversations[chatId].push({ role, text });
  if (conversations[chatId].length > 10) conversations[chatId].shift();
}

// ── Main handler ──────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  try {
    const update = req.body;

    // ── Owner replies via callback button ──
    if (update.callback_query) {
      const cb = update.callback_query;
      const clientId = cb.data.replace("reply_", "");
      await tg("answerCallbackQuery", { callback_query_id: cb.id });
      await sendMsg(cb.from.id,
        `📨 *Reply Mode*\n\nSend your message now.\nFormat: \`REPLY:${clientId}: your message here\``
      );
      return res.status(200).json({ ok: true });
    }

    const message = update?.message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = String(message.chat.id);
    const username = message.from?.username || message.from?.first_name || "Unknown";
    const text = message.text || "";
    const photo = message.photo;
    const video = message.video;
    const isOwner = cfg.owners.includes(chatId);

    // ── Owner sends REPLY:clientId: message ──
    if (isOwner && text.startsWith("REPLY:")) {
      const parts = text.replace("REPLY:", "").split(":");
      const targetId = parts[0].trim();
      const replyText = parts.slice(1).join(":").trim();
      if (targetId && replyText) {
        await sendMsg(targetId, `📩 *Message from Team:*\n\n${replyText}`);
        await sendMsg(chatId, `✅ Message sent to client ${targetId}`);
      }
      return res.status(200).json({ ok: true });
    }

    // ── Owner forwards media to client ──
    if (isOwner && (photo || video) && message.caption) {
      const targetId = message.caption.match(/\d{6,}/)?.[0];
      if (targetId) {
        if (photo) await sendPhoto(targetId, photo[photo.length - 1].file_id, "From Bangladesh Income Hub Team 📊");
        if (video) await sendVideo(targetId, video.file_id, "From Bangladesh Income Hub Team 🎥");
        await sendMsg(chatId, `✅ Media sent to client ${targetId}`);
        return res.status(200).json({ ok: true });
      }
    }

    // ── Client sends photo (payment screenshot) ──
    if (!isOwner && photo) {
      await sendMsg(chatId, `✅ *Payment screenshot received ভাইজান!*\n\nWe are verifying. Will send indicator shortly. 🙏`);
      for (const id of cfg.owners) {
        await sendPhoto(id, photo[photo.length - 1].file_id,
          `💳 *PAYMENT SCREENSHOT*\n👤 @${username}\n📱 Chat ID: ${chatId}\n\nTo reply: REPLY:${chatId}: your message`
        );
      }
      return res.status(200).json({ ok: true });
    }

    // ── Client sends video ──
    if (!isOwner && video) {
      await forwardToOwners(`🎥 Video from @${username} (${chatId})`);
      return res.status(200).json({ ok: true });
    }

    // ── Commands ──
    if (text.startsWith("/")) {
      await handleCommand(chatId, text.split(" ")[0].toLowerCase(), username);
      return res.status(200).json({ ok: true });
    }

    // ── Client text message ──
    if (text && !isOwner) {
      const intent = detectIntent(text);
      addToHistory(chatId, "user", text);
      await alertOwners(username, text, intent, chatId);
      const history = conversations[chatId] || [];
      const reply = await geminiReply(history, username);
      addToHistory(chatId, "model", reply);
      await sendMsg(chatId, reply);
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("Error:", err);
    return res.status(200).json({ ok: true });
  }
}
