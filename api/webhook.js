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

async function groqReply(messages) {
  const p = Object.values(cfg.products)[0];
  const system = `তুমি Bangladesh Income Hub এর AI sales assistant। সবসময় Bangla তে reply করবে। ভদ্র এবং friendly হবে। "ভাইজান" এবং "আপনি" ব্যবহার করবে। Islamic greeting ব্যবহার করবে। সালাম দিলে "ওয়ালাইকুম আসসালাম" বলবে।

তুমি জানো:
- Product: ${p.name} — ${p.price}
- বিবরণ: ${p.description}
- বৈশিষ্ট্য: ${p.features.join(", ")}
- bKash: ${cfg.bkash.number} (${cfg.bkash.name}) — ${cfg.bkash.type}

নিয়ম:
- কিনতে চাইলে: bKash payment guide করো, screenshot পাঠাতে বলো
- Payment screenshot পাওয়ার পর: TradingView email ও password চাও
- Video/proof চাইলে: বলো owner শীঘ্রই পাঠাবে
- সংক্ষিপ্ত এবং helpful reply দাও`;

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
        max_tokens: 500,
        temperature: 0.7
      })
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || "দুঃখিত ভাইজান, একটু সমস্যা হচ্ছে।";
  } catch (e) {
    return "দুঃখিত ভাইজান, এই মুহূর্তে reply দিতে পারছি না।";
  }
}

function detectIntent(text) {
  const t = text.toLowerCase();
  for (const [intent, keywords] of Object.entries(cfg.intents)) {
    if (keywords.some(k => t.includes(k))) return intent;
  }
  return "general";
}

const conversations = {};

function addHistory(chatId, role, text) {
  if (!conversations[chatId]) conversations[chatId] = [];
  conversations[chatId].push({ role, text });
  if (conversations[chatId].length > 12) conversations[chatId].shift();
}

const WELCOME = `আসসালামু আলাইকুম! 🌙

*বাংলাদেশ ইনকাম হাব* এ আপনাকে স্বাগতম ভাইজান!

আমরা Professional Trading Indicators নিয়ে কাজ করি।

━━━━━━━━━━━━━━━
📊 *আমাদের Product:*
━━━━━━━━━━━━━━━

🔥 *BDIH Final Version Indicator*

✅ Non-Repaint — signal একবার দিলে আর বদলায় না
✅ Non-MTG — অত্যন্ত accurate
✅ প্রতিদিন 250+ signal দেয়
✅ প্রতিটি signal এ Entry, TP এবং SL clearly দেখায়
✅ যেকোনো timeframe এ কাজ করে
✅ TradingView এ সহজে use করা যায়

💰 *Price: 5000 BDT (Special Offer)*
Regular Price: ~~10000 BDT~~

━━━━━━━━━━━━━━━
🛒 *কিনতে মাত্র ৩টি ধাপ:*
━━━━━━━━━━━━━━━

1️⃣ bKash payment করুন
2️⃣ Payment screenshot পাঠান
3️⃣ TradingView email ও password দিন
→ আমরা indicator set করে দেবো ✅

━━━━━━━━━━━━━━━
📌 *Quick Commands:*
━━━━━━━━━━━━━━━

/indicator — Indicator বিস্তারিত
/buy — Payment করার নিয়ম
/products — সব products
/support — সাহায্য দরকার?

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

    // Owner reply to client
    if (isOwner && text.startsWith("REPLY:")) {
      const parts = text.replace("REPLY:", "").split(":");
      const targetId = parts[0].trim();
      const replyText = parts.slice(1).join(":").trim();
      if (targetId && replyText) {
        await sendMsg(targetId, `📩 *Bangladesh Income Hub Team:*\n\n${replyText}`);
        await sendMsg(chatId, `✅ Message sent to client ${targetId}`);
      }
      return res.status(200).json({ ok: true });
    }

    // Owner sends media to client
    if (isOwner && (photo || video) && message.caption) {
      const targetId = message.caption.match(/\d{6,}/)?.[0];
      if (targetId) {
        if (photo) await sendPhoto(targetId, photo[photo.length - 1].file_id, "📊 Bangladesh Income Hub Team");
        if (video) await sendVideo(targetId, video.file_id, "🎥 Bangladesh Income Hub Team");
        await sendMsg(chatId, `✅ Media sent to ${targetId}`);
        return res.status(200).json({ ok: true });
      }
    }

    // Client payment screenshot
    if (!isOwner && photo) {
      await sendMsg(chatId, `✅ *Payment screenshot পেয়েছি ভাইজান!*\n\nজাযাকাল্লাহ খায়রান! 🙏\n\nএখন আপনার *TradingView email এবং password* পাঠান:\n\n📧 Email: yourmail@gmail.com\n🔒 Password: yourpassword`);
      for (const id of cfg.owners) {
        await sendPhoto(id, photo[photo.length - 1].file_id,
          `💳 *PAYMENT SCREENSHOT*\n👤 @${username}\n📱 Chat ID: \`${chatId}\`\n\nReply: \`REPLY:${chatId}: message\``
        );
      }
      return res.status(200).json({ ok: true });
    }

    // Client video
    if (!isOwner && video) {
      await forwardToOwners(`🎥 Video from @${username} (${chatId})`);
      return res.status(200).json({ ok: true });
    }

    // Commands
    if (text.startsWith("/")) {
      const cmd = text.split(" ")[0].toLowerCase();
      const p = Object.values(cfg.products)[0];

      if (cmd === "/start") {
        await sendMsg(chatId, WELCOME);
        await forwardToOwners(`👤 *New user started bot*\n@${username} (ID: ${chatId})`);
      } else if (cmd === "/indicator") {
        await sendMsg(chatId, `📊 *${p.name}*\n\n${p.description}\n\n${p.features.map(f => `✅ ${f}`).join("\n")}\n\n💰 *Price: ${p.price}*\n\nকিনতে /buy লিখুন ভাইজান।`);
      } else if (cmd === "/buy") {
        await sendMsg(chatId, `🛒 *কেনার নিয়ম:*\n\n1️⃣ bKash ${cfg.bkash.type} করুন\n📱 Number: *${cfg.bkash.number}*\n👤 Name: ${cfg.bkash.name}\n💰 Amount: *${p.price}*\n\n2️⃣ Payment screenshot এখানে পাঠান\n\n3️⃣ TradingView email ও password পাঠান\n\n4️⃣ আমরা indicator set করে দেবো ✅\n\nআল্লাহ বরকত দিন! 🤲`);
      } else if (cmd === "/products") {
        const list = Object.values(cfg.products).map(pr => `✅ *${pr.name}* — ${pr.price}`).join("\n");
        await sendMsg(chatId, `🛍️ *আমাদের Products:*\n\n${list}\n\nকিনতে /buy লিখুন।`);
      } else if (cmd === "/support") {
        await sendMsg(chatId, `🆘 *Support দরকার ভাইজান?*\n\nআপনার সমস্যা লিখুন — আমরা ইনশাআল্লাহ সাহায্য করবো।`);
        await forwardToOwners(`🆘 Support: @${username} (${chatId})`);
      }
      return res.status(200).json({ ok: true });
    }

    // Client text message
    if (text && !isOwner) {
      const intent = detectIntent(text);

      if (intent === "credentials") {
        await sendMsg(chatId, `🔑 *Credentials পেয়েছি ভাইজান!*\n\nজাযাকাল্লাহ খায়রান! ইনশাআল্লাহ আমরা শীঘ্রই আপনার TradingView account এ indicator set করে দেবো। ✅`);
        await forwardToOwners(`🔑 *TRADINGVIEW CREDENTIALS*\n👤 @${username}\n📱 Chat ID: \`${chatId}\`\n📝 ${text}\n\nReply: \`REPLY:${chatId}: message\``);
        return res.status(200).json({ ok: true });
      }

      const labels = { buy: "🛒 WANTS TO BUY", video: "🎥 WANTS VIDEO", support: "🆘 NEEDS SUPPORT", greet: "👋 GREETING", general: "💬 MESSAGE" };
      await forwardToOwners(`${labels[intent] || "💬 MESSAGE"}\n👤 @${username} (ID: \`${chatId}\`)\n📝 "${text}"\n\nReply: \`REPLY:${chatId}: message\``);

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
