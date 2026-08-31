# BookPro — Service Booking App (phone-first)

Blue dots appear **only after** a booking is submitted.  
Red dots appear **only after** a cancel or reschedule.  
Empty days stay empty.

Works on a Motorola / any Android: download ZIP → unzip → drop the folder on Netlify. **No npm. No computer.**

Repo: https://github.com/byfanzoftheone-stack/bookpro-booking-app

## Deploy from phone (about 3 minutes)

1. Open https://github.com/byfanzoftheone-stack/bookpro-booking-app
2. Tap **Code → Download ZIP**
3. Unzip in Files
4. Go to [netlify.com/drop](https://app.netlify.com/drop) (or Netlify app)
5. Drop the unzipped folder (the one that contains `index.html`)
6. Site is live

The app runs immediately with **local storage**. Each browser is its own company sandbox until you add Supabase.

## What is included

- Monthly calendar, glass cards
- Booked = cyan-blue dots (left column, max 8 then +N)
- Canceled / leftover from reschedule = red-orange dots (right column)
- Booking form → Thank you card → blue dot appears
- Cancel → “Cancel or reschedule?” confirm
- Reschedule → original day gets a red dot, new day gets a blue dot
- Admin settings: logo URL, business name, 3 brand colors × 6 presets, 8-slot grid toggle (off by default), Save toast
- Employee pin login + Clock In / Clock Out that persist
- Tap a blue or red dot for the appointment card
- Quote form using saved logo + colors
- Dark / light theme

## Optional: Supabase (multi-tenant later)

1. Create a free project at supabase.com
2. SQL editor → paste `supabase/schema.sql` → Run
3. Wire URL + anon key when you are ready
4. App stays on-device until then so you can demo the dots today.
