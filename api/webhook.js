const cfg = require("../config");
const TG = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;
const GROQ_KEY = process.env.GROQ_API_KEY;

async function tg(method, body) {
  const r = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function sendMsg(chatId, text) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown" });
}

async function sendPhoto(chatId, photo, caption) {
  return tg("sendPhoto", { chat_id: chatId, photo, caption });
}

async function sendVideo(chatId, video, caption) {
  return tg("sendVideo", { chat_id: chatId, video, caption });
}

async function forwardToOwners(text) {
  for (const id of cfg.owners) await sendMsg(id, text);
}

async function groqReply(messages) {
  const productList = Object.values(cfg.products)
    .map(p => `${p.name}: ${p.price}`).join(", ");

  const system = `তুমি Bangladesh Income Hub এর professional AI sales assistant। সবসময় Bangla তে reply করবে। ভদ্র এবং professional হবে। "ভাইজান" এবং "আপনি" ব্যবহার করবে।

তুমি জানো:
- Products: ${productList}
- bKash: ${cfg.bkash.number} (${cfg.bkash.name})
- Support: ${cfg.ownerTelegram}

নিয়ম:
- কিনতে চাইলে /buy লিখতে বলো
- Support এর জন্য ${cfg.ownerTelegram} এ যেতে বলো
- সংক্ষিপ্ত এবং helpful reply দাও
- কখনো false promise করো না`;

  const msgs = [{ role: "system", content: system }];
  for (const h of messages) {
    msgs.push({ role: h.role === "model" ? "assistant" : "user", content: h.text });
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: msgs,
        max_tokens: 400,
        temperature: 0.7
      })
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ||
      `দুঃখিত ভাইজান, সমস্যা হচ্ছে। ${cfg.ownerTelegram} এ যোগাযোগ করুন।`;
  } catch (e) {
    return `দুঃখিত ভাইজান, reply দিতে পারছি না। ${cfg.ownerTelegram} এ যোগাযোগ করুন।`;
  }
}

function detectIntent(text) {
  const t = text.toLowerCase();
  for (const [intent, keywords] of Object.entries(cfg.intents)) {
    if (keywords.some(k => t.includes(k))) return intent;
  }
  return "general";
}

function buildProductList() {
  return Object.values(cfg.products)
    .map((p, i) => `${i + 1}. *${p.name}*\n   💰 ${p.price}`)
    .join("\n\n");
}

const conversations = {};
function addHistory(chatId, role, text) {
  if (!conversations[chatId]) conversations[chatId] = [];
  conversations[chatId].push({ role, text });
  if (conversations[chatId].length > 10) conversations[chatId].shift();
}

const WELCOME = `আসসালামু আলাইকুম ওয়ারাহমাতুল্লাহ! 🌙

*বাংলাদেশ ইনকাম হাব* এ আপনাকে স্বাগতম ভাইজান!

আমরা Professional TradingView Indicators তৈরি ও সরবরাহ করি।

━━━━━━━━━━━━━━━━━━
📊 *আমাদের Service:*
━━━━━━━━━━━━━━━━━━

আমরা আপনার জন্য:
✅ নতুন TradingView account তৈরি করি
✅ Indicator setup করে দিই
✅ ২৪ ঘন্টার মধ্যে সব সম্পন্ন করি

━━━━━━━━━━━━━━━━━━
📌 *Quick Menu:*
━━━━━━━━━━━━━━━━━━

/indicator — Indicator সম্পর্কে জানুন
/buy — কেনার সম্পূর্ণ গাইড
/products — সকল products দেখুন
/support — সাহায্য বা যোগাযোগ

যেকোনো প্রশ্ন করুন ভাইজান! 🤝`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });
  try {
    const update = req.body;
    const message = update?.message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = String(message.chat.id);
    const username = message.from?.username || message.from?.first_name || "Unknown";
    const text = message.text || "";
    const photo = message.photo;
    const video = message.video;
    const isOwner = cfg.owners.includes(chatId);

    // Owner → Client reply
    if (isOwner && text.startsWith("REPLY:")) {
      const parts = text.replace("REPLY:", "").split(":");
      const targetId = parts[0].trim();
      const replyText = parts.slice(1).join(":").trim();
      if (targetId && replyText) {
        await sendMsg(targetId,
          `📩 *Bangladesh Income Hub — Team Message:*\n\n${replyText}\n\n_আরো সাহায্যের জন্য ${cfg.ownerTelegram} এ যোগাযোগ করুন।_`);
        await sendMsg(chatId, `✅ Message delivered to client (${targetId})`);
      }
      return res.status(200).json({ ok: true });
    }

    // Owner → Client media
    if (isOwner && (photo || video) && message.caption) {
      const targetId = message.caption.match(/\d{6,}/)?.[0];
      if (targetId) {
        if (photo) await sendPhoto(targetId, photo[photo.length - 1].file_id,
          "📊 Bangladesh Income Hub — আপনার indicator ready!");
        if (video) await sendVideo(targetId, video.file_id,
          "🎥 Bangladesh Income Hub — Team message");
        await sendMsg(chatId, `✅ Media delivered to client (${targetId})`);
        return res.status(200).json({ ok: true });
      }
    }

    // Client → Payment screenshot
    if (!isOwner && photo) {
      await sendMsg(chatId,
        `✅ *Payment screenshot সফলভাবে পেয়েছি ভাইজান!*

জাযাকাল্লাহ খায়রান! 🙏

এখন শুধু আপনার *নতুন Email এবং Password* পাঠান:

📧 *Email:* আপনার নতুন Gmail address
🔒 *Password:* Gmail এর password

_সব তথ্য পাওয়ার পর ২৪ ঘন্টার মধ্যে:_
_✅ TradingView account তৈরি হবে_
_✅ Indicator setup হবে_
_✅ আপনাকে জানানো হবে ইনশাআল্লাহ_`);

      for (const id of cfg.owners) {
        await sendPhoto(id, photo[photo.length - 1].file_id,
          `💳 নতুন Payment!\n👤 @${username}\nChat ID: ${chatId}\n\nReply: REPLY:${chatId}: message`);
      }
      return res.status(200).json({ ok: true });
    }

    // Client → Video
    if (!isOwner && video) {
      await forwardToOwners(`🎥 Video from @${username} (${chatId})`);
      return res.status(200).json({ ok: true });
    }

    // Commands
    if (text.startsWith("/")) {
      const cmd = text.split(" ")[0].toLowerCase();
      const firstProduct = Object.values(cfg.products)[0];

      if (cmd === "/start") {
        await sendMsg(chatId, WELCOME);
        await forwardToOwners(`👤 New user joined!\n@${username} (ID: ${chatId})`);

      } else if (cmd === "/indicator") {
        await sendMsg(chatId,
          `📊 *${firstProduct.name}*\n\n${firstProduct.description}\n\n${firstProduct.features.map(f => `✅ ${f}`).join("\n")}\n\n💰 *মূল্য: ${firstProduct.price}*\n\nকিনতে /buy লিখুন ভাইজান।`);

      } else if (cmd === "/buy") {
        await sendMsg(chatId,
          `🛒 *Indicator কেনার সম্পূর্ণ গাইড:*

━━━━━━━━━━━━━━━━━━
📊 *আমাদের Available Indicators:*
━━━━━━━━━━━━━━━━━━

${buildProductList()}

━━━━━━━━━━━━━━━━━━
📧 *Step 1: নতুন Email তৈরি করুন*
━━━━━━━━━━━━━━━━━━

প্রথমে একটি নতুন Gmail account তৈরি করুন।
এই email দিয়ে TradingView account খোলা হবে।

━━━━━━━━━━━━━━━━━━
💳 *Step 2: bKash Payment করুন*
━━━━━━━━━━━━━━━━━━

📱 Number: *${cfg.bkash.number}*
👤 Name: ${cfg.bkash.name}
🔄 Type: ${cfg.bkash.type}
💰 Amount: আপনার indicator এর মূল্য

━━━━━━━━━━━━━━━━━━
📤 *Step 3: Telegram এ পাঠান*
━━━━━━━━━━━━━━━━━━

${cfg.ownerTelegram} এ পাঠান:
✅ bKash payment screenshot
✅ নতুন Gmail address
✅ Gmail password
✅ কোন indicator চান সেটা উল্লেখ করুন

━━━━━━━━━━━━━━━━━━
⏰ *২৪ ঘন্টার মধ্যে পাবেন:*
━━━━━━━━━━━━━━━━━━

✅ নতুন TradingView account
✅ Indicator setup সম্পন্ন
✅ Confirmation message

━━━━━━━━━━━━━━━━━━
🎁 *আমাদের সাথে পাচ্ছেন:*
━━━━━━━━━━━━━━━━━━

✅ ২৪ ঘন্টার মধ্যে সম্পূর্ণ setup
✅ Lifetime support
✅ Money management guidance
✅ Risk management guidance

📞 যোগাযোগ: @BANGLADESH_IH

আল্লাহ বরকত দিন! 🤲\`);

      } else if (cmd === "/products") {
        await sendMsg(chatId,
          `🛍️ *Bangladesh Income Hub — সকল Products:*\n\n${buildProductList()}\n\n━━━━━━━━━━━━━━━━━━\nকিনতে /buy লিখুন অথবা সরাসরি যোগাযোগ করুন:\n📞 ${cfg.ownerTelegram}`);

      } else if (cmd === "/support") {
        await sendMsg(chatId,
          `🆘 *Support Center*\n\nআপনার সমস্যা বা প্রশ্ন লিখুন।\n\n📞 Direct contact: ${cfg.ownerTelegram}\n\n_আমাদের team শীঘ্রই সাহায্য করবে ইনশাআল্লাহ।_`);
        await forwardToOwners(`🆘 Support: @${username} (${chatId})`);
      }
      return res.status(200).json({ ok: true });
    }

    // Client text → AI reply
    if (text && !isOwner) {
      const intent = detectIntent(text);

      if (intent === "credentials") {
        await sendMsg(chatId,
          `🔑 *তথ্য সফলভাবে পেয়েছি ভাইজান!*

জাযাকাল্লাহ খায়রান! 🙏

আমাদের team কাজ শুরু করেছে।

⏰ *২৪ ঘন্টার মধ্যে:*
✅ TradingView account তৈরি হবে
✅ Indicator setup হবে
✅ আপনাকে confirm করা হবে

যেকোনো সমস্যায়: ${cfg.ownerTelegram} ✅`);

        await forwardToOwners(
          `🔑 CREDENTIALS RECEIVED\n👤 @${username} (${chatId})\n📝 ${text}\n\nReply: REPLY:${chatId}: message`);
        return res.status(200).json({ ok: true });
      }

      const labels = {
        buy: "🛒 WANTS TO BUY",
        video: "🎥 WANTS VIDEO",
        support: "🆘 NEEDS SUPPORT",
        greet: "👋 NEW GREETING",
        general: "💬 MESSAGE"
      };

      await forwardToOwners(
        `${labels[intent] || "💬 MESSAGE"}\n👤 @${username} (${chatId})\n📝 "${text}"\n\nReply: REPLY:${chatId}: message`);

      addHistory(chatId, "user", text);
      const reply = await groqReply(conversations[chatId]);
      addHistory(chatId, "model", reply);
      await sendMsg(chatId, reply);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error:", err);
    return res.status(200).json({ ok: true });
  }
}
