const express = require('express');
const path = require('path');
const { handleContactRequest } = require('./lib/contact');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));

app.post('/api/contact', handleContactRequest);

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`ACURA BRASIL site running on port ${PORT}`);
});
