const dblock = require('./dblock');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    while(true) {
        await dblock.lock('send_sms');
        console.log('Locked');
        await sleep(2 * 1000);
        await dblock.unlock('send_sms');
        console.log('unlock');
        await sleep(3 * 1000);
    }
}


main();


