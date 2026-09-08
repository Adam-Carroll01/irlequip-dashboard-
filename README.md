# Road Tech Tracker

A dashboard for tracking Irlequip's road/field technicians on a schematic map
of Ireland's 32 counties. It reads and writes a dedicated Trello board, so
your colleague can also update it from the Trello app on his phone — the
dashboard is just a nicer view on top of the same board.

This is a separate app from `irlequip-dashboard-2` (the workshop scheduler)
and uses its own Trello board and its own API credentials, so it can't
interfere with that board.

## How it works

- One Trello **list** holds one **card per technician**.
- Each card's description stores structured fields (County, Customer,
  Machine, Problem, Status, Updated) — the same "structured fields in the
  description" pattern used in the workshop dashboard.
- The dashboard shows a map view (technicians as markers on their county)
  and a list/table view, and polls Trello every 30 seconds.
- Clicking a technician (or a county, to add someone new) opens a form that
  writes straight back to the Trello card.
- Your colleague can also just open the Trello board directly and edit
  cards there — changes will show up on the dashboard within 30 seconds.

## 1. Create the Trello board

1. In Trello, create a new board — e.g. **"Irlequip Road Techs"**.
2. Add one list to it, e.g. **"Technicians"**. (You can add more lists later
   — e.g. "Archived" — but only cards in the list you configure below show
   up on the dashboard.)
3. Invite your colleague to the board so he can view/edit it from the
   Trello mobile app.
4. You don't need to create cards by hand — the dashboard's "+ Add
   technician" button creates them for you. But you can also add a card per
   technician manually if you prefer to set it up up front.

## 2. Get a Trello API key and token

1. Go to <https://trello.com/power-ups/admin> (or
   <https://trello.com/app-key> on older accounts) while logged into the
   Trello account that owns the board.
2. Copy the **API Key** shown there.
3. On the same page, generate a **Token** (click "Token" / "manually
   generate a Token") and authorize it — this gives the app permission to
   read and write your boards. Copy the token too.
4. Keep both somewhere safe — they go into environment variables, never
   into the code itself.

## 3. Get the Trello List ID

The app needs the ID of the "Technicians" list, not just its name.

Easiest way: with your key and token from step 2, visit this URL in your
browser (replace `BOARD_ID`, `KEY`, and `TOKEN`; the board ID is the string
in your board's URL after `trello.com/b/`):
