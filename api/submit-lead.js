export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const AC_URL = process.env.AC_API_URL;
  const AC_KEY = process.env.AC_API_KEY;

  if (!AC_URL || !AC_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration: missing AC credentials' });
  }

  const { full_name, email, business } = req.body;

  if (!email || !full_name) {
    return res.status(400).json({ error: 'Email and name are required' });
  }

  const headers = {
    'Api-Token': AC_KEY,
    'Content-Type': 'application/json',
  };

  const nameParts = full_name.trim().split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || '';

  try {
    // 1. Create or update contact
    const syncRes = await fetch(`${AC_URL}/api/3/contact/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contact: { email, firstName, lastName },
      }),
    });
    const syncData = await syncRes.json();
    const contactId = syncData.contact?.id;
    if (!contactId) throw new Error(`Contact sync failed: ${JSON.stringify(syncData)}`);

    // 2. Find or create list "NEO Sprint - Interested"
    const LIST_NAME = 'NEO Sprint - Interested';
    const listsRes = await fetch(`${AC_URL}/api/3/lists?limit=100`, { headers });
    const listsData = await listsRes.json();
    let list = listsData.lists?.find(l => l.name === LIST_NAME);

    if (!list) {
      const createRes = await fetch(`${AC_URL}/api/3/lists`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          list: {
            name: LIST_NAME,
            stringid: 'neo-sprint-interested',
            sender_url: 'https://northeastohioaiaccelerator.com',
            sender_reminder: 'You opted in at northeastohioaiaccelerator.com',
          },
        }),
      });
      const createData = await createRes.json();
      list = createData.list;
    }

    // 3. Add contact to list
    await fetch(`${AC_URL}/api/3/contactLists`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contactList: { list: list.id, contact: contactId, status: 1 },
      }),
    });

    // 4. Find or create tag "lead-form-submitted"
    const TAG_NAME = 'lead-form-submitted';
    const tagsRes = await fetch(`${AC_URL}/api/3/tags?search=${TAG_NAME}`, { headers });
    const tagsData = await tagsRes.json();
    let tag = tagsData.tags?.find(t => t.tag === TAG_NAME);

    if (!tag) {
      const createTagRes = await fetch(`${AC_URL}/api/3/tags`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tag: { tag: TAG_NAME, tagType: 'contact', description: 'Submitted lead form at northeastohioaiaccelerator.com' },
        }),
      });
      const createTagData = await createTagRes.json();
      tag = createTagData.tag;
    }

    // 5. Apply tag to contact
    await fetch(`${AC_URL}/api/3/contactTags`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contactTag: { contact: contactId, tag: tag.id },
      }),
    });

    return res.status(200).json({ success: true, contactId });
  } catch (err) {
    console.error('AC integration error:', err.message);
    return res.status(500).json({ error: 'ActiveCampaign submission failed' });
  }
}
