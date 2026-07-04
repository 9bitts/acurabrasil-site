const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

async function readPasswordFromStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main() {
  const password = await readPasswordFromStdin();
  if (!password) {
    console.error('Error: no password received on stdin');
    process.exit(1);
  }

  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  process.stdout.write(`${salt.toString('hex')}:${hash.toString('hex')}\n`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
