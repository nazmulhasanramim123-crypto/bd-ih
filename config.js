module.exports = {
  owners: [],

  // ================================================
  // PRODUCTS — নতুন indicator add করতে এখানে যোগ করো
  // ================================================
  products: {
    bdih_final: {
      name: "BDIH Final Version",
      price: "5,000 BDT (অফার) | নিয়মিত মূল্য: 10,000 BDT",
      description: "Non-Repaint, Non-MTG indicator যা প্রতিদিন 250+ accurate signal দেয়। প্রতিটি signal এ Entry, TP এবং SL clearly দেখায়। Signal একবার দিলে আর পরিবর্তন হয় না।",
      features: [
        "Non-Repaint — signal কখনো বদলায় না",
        "Non-MTG — highly accurate",
        "প্রতিদিন 250+ signal",
        "Entry, TP এবং SL সহ",
        "সকল timeframe এ কার্যকর"
      ]
    },
    // নতুন indicator add করতে নিচের অংশটা copy করে uncomment করো:
    // bdih_pro: {
    //   name: "BDIH Pro Version",
    //   price: "8,000 BDT",
    //   description: "বিবরণ লিখুন",
    //   features: ["feature 1", "feature 2"]
    // },
  },

  // ================================================
  // BKASH INFO
  // ================================================
  bkash: {
    number: "01570203715",
    name: "Bangladesh Income Hub",
    type: "Send Money"
  },

  // ================================================
  // OWNER CONTACT
  // ================================================
  ownerTelegram: "@BANGLADESH_IH",

  // ================================================
  // INTENT KEYWORDS
  // ================================================
  intents: {
    buy: ["nibo", "kinbo", "buy", "purchase", "order", "payment", "price", "koto", "cost", "নেবো", "কিনবো", "দাম", "মূল্য"],
    video: ["video", "dekhi", "dekhao", "show", "example", "sample", "proof", "দেখাও", "ভিডিও"],
    credentials: ["email", "password", "pass", "gmail", "tradingview", "login", "account"],
    support: ["help", "problem", "issue", "somossa", "error", "সমস্যা", "help"],
    greet: ["hi", "hello", "assalamu", "salam", "vai", "bhai", "হ্যালো", "ভাই", "সালাম"]
  }
};
