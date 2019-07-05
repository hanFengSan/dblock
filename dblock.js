const mongoose = require('mongoose');
mongoose.connect(
    'mongodb://127.0.0.1:27017/test',
    { useNewUrlParser: true }
);
const LockSchema = new mongoose.Schema({
    _id: String,
    acquirer: String,
    acquiredAt: Date,
    updatedAt: { type: Date, expires: 10, default: Date.now }
});
const Lock = mongoose.model('Lock', LockSchema);

class DBLock {
    constructor() {
        this._uuid = this.uuid(); // 分布式节点的uuid
        console.log(this._uuid);
        this._autoRenewTimer = new Map(); // 自动续期定时器id
    }

    // 基于时间戳生成的uuid
    uuid() {
        var d = Date.now();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(
            c
        ) {
            var r = (d + Math.random() * 16) % 16 | 0;
            d = Math.floor(d / 16);
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    }

    // 获取一次锁
    async acquire(name) {
        try {
            const lock = new Lock({
                _id: name,
                acquirer: this._uuid,
                acquiredAt: new Date(),
                updatedAt: new Date()
            });
            await lock.save();
            return true;
        } catch (e) {
            console.log('cannot acquire');
            return false;
        }
    }

    // 获取锁, 每3s重试一次
    async lock(name, retryInterval = 3000) {
        while (true) {
            if (await this.acquire(name)) {
                this.autoRenew(name);
                break;
            } else {
                await this.sleep(retryInterval);
            }
        }
    }

    // 解锁
    async unlock(name) {
        this.removeRenew(name);
        await Lock.deleteMany({ _id: name, acquirer: this._uuid });
    }

    // 续期
    async renew(name) {
        let result = await Lock.updateOne(
            { _id: name, acquirer: this._uuid },
            {
                updatedAt: new Date()
            }
        );
        console.log('renew');
    }

    // 自动续期
    autoRenew(name) {
        this._autoRenewTimer.set(
            name,
            setInterval(() => this.renew(name), 10 * 1000)
        );
    }

    // 移除自动续期
    removeRenew(name) {
        let timerID = this._autoRenewTimer.get(name);
        if (timerID) {
            clearInterval(timerID);
        }
    }

    // 睡眠
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

let instance = new DBLock();
module.exports = instance;
