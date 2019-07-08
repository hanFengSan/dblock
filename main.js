const dblock = require('./dblock');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    while(true) {
      try {
        await dblock.lock('send_sms');
        console.log('Locked');
        await sleep(15 * 1000);
        await dblock.renew('send_sms');
        await sleep(15 * 1000);
        console.log('unlock');
        await sleep(3 * 1000);
      } finally {
        await dblock.unlock('send_sms');

      }
    }
}

main();


