# Whatnot Uploader — iPhone app (PWA)

A phone version of the desktop tool. Pick your show photos, it auto-groups them into
items by capture time, you type titles/prices, and it builds the **exact same
`whatnot-import.csv`** — then you upload that in the Whatnot app's bulk import.

Photos never leave the phone except when you upload them to get image links, and that
goes through *your own* free relay (see step C).

This is a **separate, standalone app** — the desktop `WhatNot Bulk uploader` folder is
untouched, so you have both options.

---

## A. Put it online (one time)

A phone "app" like this is just a website you add to your home screen. It needs to live
at an `https://` address. Easiest free way:

**Netlify Drop (no account needed to try):**
1. On a computer, go to **app.netlify.com/drop**.
2. Drag this whole **`Whatnot Uploader Mobile`** folder onto the page.
3. It gives you a link like `https://random-name.netlify.app`. That's your app.
   (Make a free Netlify account to keep the link permanent.)

*(Any static host works — GitHub Pages, Vercel, etc.)*

## B. Add it to your iPhone home screen
1. Open the link above in **Safari** on your iPhone.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. You now have a **Whatnot Uploader** icon, opens full-screen like a real app.

## C. Set up photo uploads (one time, ~5 min, free)
Phones can't upload to the photo host directly, so you run a tiny free "relay":
1. On a computer: **dash.cloudflare.com** → free account.
2. **Workers & Pages** → **Create** → **Create Worker** → **Deploy**.
3. **Edit code** → delete everything → paste the contents of **`worker.js`** → **Deploy**.
4. Copy the worker URL (`https://something.workers.dev`).
5. In the app: **⚙ Settings → Image upload link** → paste it.

---

## Using it
1. **Photos tab** — type the show name + a code letter (A → items A1, A2…), tap **Add
   photos**, pick the show's photos. They sort by capture time and group into items.
2. **Items tab** — fix grouping if needed (**split here** starts a new item at a photo;
   **merge** joins it to the one above), then type Title / Price / Description / Condition /
   Shipping for each. "Apply defaults to all" fills repeats fast.
3. **Export tab** — **Upload photos** (gets the image links), then **Build & share CSV**.
   Use Save to Files or share straight into the Whatnot app.
4. In **Whatnot** → Seller tools → **Bulk import** → choose the CSV.

HEIC photos are converted to JPG automatically when uploading. JPG/PNG are used as-is.

Category is fixed to **Antiques, Vintage & Ephemera → Vintage Decor** (edit the top of
`app.js` to change it). Condition / Shipping lists also live at the top of `app.js`.
