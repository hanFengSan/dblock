# dblock
基于MongoDB的分布式锁, 互斥锁.
当分布式部署的时候, 简单的本地锁是没办法满足需求的. 实现分布式锁的方法多样, 比如基于Mysql或Redis的. 本文介绍基于MongoDB的分布式互斥锁. 实现中, 采用Mongoose, 若是直接MongoDB, 也是差不多的.

我们将使用以下Mongoose的Schema在MongoDB中描述锁:
```
const LockSchema = new mongoose.Schema({
    _id: String, // 锁名
    acquirer: String, // 分布式结点的uuid
    acquiredAt: Date, // 获取锁时的时间
    updatedAt: { type: Date, expires: 2 * 60, default: Date.now } // 更新时间, 2分钟后过期自动删除
});
```
* *_id*: 这个_id直接用于存储锁名, 直接利用**MongoDB中_id的唯一性**来保证锁的唯一
* *acquirer*: 这种用于保存分布式结点的uuid, 这样方便在数据中查看是谁在使用这把锁, 以及删除的时候, 联查这个属性, 避免删错
* *acquiredAt*: 获取到锁的时候, 存入获取时间到这个属性, 这样可以和updatedAt想减, 可得知正常使用的这个锁的节点已经使用了的时长.
* *updatedAt*: 更新时间, 
  1. 初始时和acquiredAt一致. 然后节点在使用时, 如果执行时间比较长, 则每隔一段时间调用renew函数更新一次这个属性, 避免使用时长过长, 导致超过了expires时间, 而被迫释放锁.
  2. 设置了自动过期时间, 也就是expires属性, 这个属性对应mongoDB中的expireafterseconds的属性. 避免节点获取锁后, 挂掉, 从而导致死锁. 超时后, MongoDB会自动删除. **注意: MongoDB的expire调度是每分钟一次, 所以不是一过期就立马删除的**

#### 具体实现demo
首先dblock.js实现如下:
```
// dblock.js
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
                break;
            } else {
                await this.sleep(retryInterval);
            }
        }
    }

    // 解锁
    async unlock(name) {
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

    // 睡眠
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

let instance = new DBLock();
module.exports = instance;

```
然后测试例子main.js:
```
// main.js
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
```
分布式测试的话, 可以手动多开几个shell, 同时运行这个main.js, 即可模拟分布式中的锁的争抢及使用.