require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const {
  TRELLO_KEY,
  TRELLO_TOKEN,
  TRELLO_BOARD_ID,
  PORT = 3000,
} = process.env;

if (!TRELLO_KEY || !TRELLO_TOKEN || !TRELLO_BOARD_ID) {
  console.warn(
    '[warning] TRELLO_KEY / TRELLO_TOKEN / TRELLO_BOARD_ID are not fully set. ' +
      'Set them as environment variables before deploying — see README.md.'
  );
}

const TRELLO_BASE = 'https://api.trello.com/1';

function trelloAuth(extra = {}) {
  return new URLSearchParams({
    key: TRELLO_KEY || '',
    token: TRELLO_TOKEN || '',
    ...extra,
  });
}

// Status = which Trello list the card is sitting in (same pattern as the
// workshop dashboard's Scheduled / Diagnosis / In Progress / etc. lists).
// Lists are cached briefly rather than fetched on every request.
let listsCache = { at: 0, lists: [] };
const LISTS_CACHE_MS = 15000;

async function getLists() {
  if (Date.now() - listsCache.at < LISTS_CACHE_MS && listsCache.lists.length) {
    return listsCache.lists;
  }
  const url = `${TRELLO_BASE}/boards/${TRELLO_BOARD_ID}/lists?${trelloAuth({
    fields: 'name,id,pos',
  })}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Trello API error ${r.status}: ${await r.text()}`);
  const lists = (await r.json()).sort((a, b) => a.pos - b.pos);
  listsCache = { at: Date.now(), lists };
  return lists;
}

// Remaining structured fields are stored line-by-line in the Trello card
// description (Status is no longer one of these — it's derived from idList).
const FIELD_ORDER = ['County', 'Customer', 'Machine', 'Problem', 'Date', 'Updated'];

function parseDescription(desc = '') {
  const fields = { County: '', Customer: '', Machine: '', Problem: '', Date: '', Updated: '' };
  desc.split('\n').forEach((line) => {
    const match = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (match && FIELD_ORDER.includes(match[1])) {
      fields[match[1]] = match[2].trim();
    }
  });
  return fields;
}

function buildDescription(fields) {
  return FIELD_ORDER.map((key) => `${key}: ${fields[key] ?? ''}`).join('\n');
}

function cardToTechnician(card, listsById) {
  const fields = parseDescription(card.desc);
  return {
    id: card.id,
    name: card.name,
    county: fields.County,
    customer: fields.Customer,
    machine: fields.Machine,
    problem: fields.Problem,
    status: listsById.get(card.idList)?.name || 'Unknown',
    date: fields.Date,
    updated: fields.Updated,
    trelloUrl: card.shortUrl,
  };
}

// --- API routes -------------------------------------------------------

// Exposes the board's lists (in order) as the set of valid statuses, so the
// frontend never has to hardcode list names.
app.get('/api/config', async (req, res) => {
  try {
    const lists = await getLists();
    res.json({ statuses: lists.map((l) => ({ id: l.id, name: l.name })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load board lists from Trello', detail: String(err) });
  }
});

app.get('/api/technicians', async (req, res) => {
  try {
    const lists = await getLists();
    const listsById = new Map(lists.map((l) => [l.id, l]));

    const url = `${TRELLO_BASE}/boards/${TRELLO_BOARD_ID}/cards?${trelloAuth({
      fields: 'name,desc,shortUrl,idList,dateLastActivity',
    })}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Trello API error ${r.status}: ${await r.text()}`);
    const cards = await r.json();
    res.json(cards.map((c) => cardToTechnician(c, listsById)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load technicians from Trello', detail: String(err) });
  }
});

app.post('/api/technicians', async (req, res) => {
  try {
    const { name, county, customer, machine, problem, status, date } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const lists = await getLists();
    const listsById = new Map(lists.map((l) => [l.id, l]));
    const targetList = lists.find((l) => l.name === status) || lists[0];
    if (!targetList) throw new Error('Board has no lists to file the card under');

    const fields = {
      County: county || '',
      Customer: customer || '',
      Machine: machine || '',
      Problem: problem || '',
      Date: date || '',
      Updated: new Date().toISOString(),
    };

    const url = `${TRELLO_BASE}/cards?${trelloAuth({
      idList: targetList.id,
      name,
      desc: buildDescription(fields),
    })}`;
    const r = await fetch(url, { method: 'POST' });
    if (!r.ok) throw new Error(`Trello API error ${r.status}: ${await r.text()}`);
    const card = await r.json();
    res.json(cardToTechnician(card, listsById));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create technician card', detail: String(err) });
  }
});

app.put('/api/technicians/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, county, customer, machine, problem, status, date } = req.body;

    const lists = await getLists();
    const listsById = new Map(lists.map((l) => [l.id, l]));

    const fields = {
      County: county || '',
      Customer: customer || '',
      Machine: machine || '',
      Problem: problem || '',
      Date: date || '',
      Updated: new Date().toISOString(),
    };

    const params = trelloAuth({ desc: buildDescription(fields) });
    if (name) params.set('name', name);
    if (status) {
      const targetList = lists.find((l) => l.name === status);
      if (targetList) params.set('idList', targetList.id);
    }

    const url = `${TRELLO_BASE}/cards/${id}?${params}`;
    const r = await fetch(url, { method: 'PUT' });
    if (!r.ok) throw new Error(`Trello API error ${r.status}: ${await r.text()}`);
    const card = await r.json();
    res.json(cardToTechnician(card, listsById));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update technician card', detail: String(err) });
  }
});

app.delete('/api/technicians/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Archive rather than permanently delete, so history is kept on Trello.
    const url = `${TRELLO_BASE}/cards/${id}?${trelloAuth({ closed: 'true' })}`;
    const r = await fetch(url, { method: 'PUT' });
    if (!r.ok) throw new Error(`Trello API error ${r.status}: ${await r.text()}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to archive technician card', detail: String(err) });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    configured: Boolean(TRELLO_KEY && TRELLO_TOKEN && TRELLO_BOARD_ID),
  });
});

app.listen(PORT, () => {
  console.log(`Road Tech Tracker running on port ${PORT}`);
});
