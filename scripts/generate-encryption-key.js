const crypto = require('crypto');

process.stdout.write(`${crypto.randomBytes(32).toString('hex')}\n`);
