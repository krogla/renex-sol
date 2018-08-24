const RenExAtomicSwapper = artifacts.require("RenExAtomicSwapper");

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
chai.should();

import { SHA256 } from "crypto-js";
import * as HEX from "crypto-js/enc-hex";

const random32Bytes = () => {
    return `0x${SHA256(Math.random().toString()).toString()}`;
}

const secondsFromNow = (seconds: number) => {
    return Math.round((new Date()).getTime() / 1000) + seconds;
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const second = 1000;

contract("RenExAtomicSwapper", function (accounts) {

    let renExAtomicSwapper;
    const alice = accounts[1];
    const bob = accounts[2];
    const eve = accounts[3];

    before(async function () {
        renExAtomicSwapper = await RenExAtomicSwapper.new();
    });

    it("can perform atomic swap", async () => {
        const swapID = random32Bytes(), secret = random32Bytes();
        const secretLock = `0x${SHA256(HEX.parse(secret.slice(2))).toString()}`;

        await renExAtomicSwapper.initiate(
            swapID, bob, secretLock, secondsFromNow(60 * 60 * 24),
            { from: alice, value: 100000 }
        );

        await renExAtomicSwapper.audit(swapID);

        await renExAtomicSwapper.redeem(swapID, secret, { from: bob });

        await renExAtomicSwapper.auditSecret(swapID);
    });

    it("can refund an atomic swap", async () => {
        const swapID = random32Bytes(), secret = random32Bytes();
        const secretLock = `0x${SHA256(HEX.parse(secret.slice(2))).toString()}`;

        await renExAtomicSwapper.initiate(swapID, bob, secretLock, 0, { from: alice, value: 100000 });
        await renExAtomicSwapper.refund(swapID, { from: alice });
    });

    it("operations check order status", async () => {
        const swapID = random32Bytes(), secret = random32Bytes();
        const secretLock = `0x${SHA256(HEX.parse(secret.slice(2))).toString()}`;

        // Can only initiate for INVALID swaps
        await renExAtomicSwapper.initiate(swapID, bob, secretLock, secondsFromNow(1), { from: alice, value: 100000 });
        await renExAtomicSwapper.initiate(swapID, bob, secretLock, secondsFromNow(1), { from: alice, value: 100000 })
            .should.be.rejectedWith(null, /swap opened previously/);

        await renExAtomicSwapper.auditSecret(swapID)
            .should.be.rejectedWith(null, /revert/);

        await renExAtomicSwapper.refund(swapID, { from: alice })
            .should.be.rejectedWith(null, /swap not expirable/);

        // Can only redeem for OPEN swaps and with valid key
        await renExAtomicSwapper.redeem(swapID, secretLock, { from: bob })
            .should.be.rejectedWith(null, /invalid secret/);
        await renExAtomicSwapper.redeem(swapID, secret, { from: bob });
        await renExAtomicSwapper.redeem(swapID, secret, { from: bob })
            .should.be.rejectedWith(null, /swap not open/);
    });

    it("can return details", async () => {
        const swapID = random32Bytes(), secret = random32Bytes();
        const secretLock = `0x${SHA256(HEX.parse(secret.slice(2))).toString()}`;

        // Before initiating
        (await renExAtomicSwapper.initiatable(swapID)).should.equal(true);
        (await renExAtomicSwapper.refundable(swapID)).should.equal(false);
        (await renExAtomicSwapper.redeemable(swapID)).should.equal(false);

        await renExAtomicSwapper.initiate(swapID, bob, secretLock, secondsFromNow(1), { from: alice, value: 100000 });

        (await renExAtomicSwapper.initiatable(swapID)).should.equal(false);
        (await renExAtomicSwapper.refundable(swapID)).should.equal(false);
        (await renExAtomicSwapper.redeemable(swapID)).should.equal(true);

        await sleep(2 * second);

        (await renExAtomicSwapper.initiatable(swapID)).should.equal(false);
        (await renExAtomicSwapper.refundable(swapID)).should.equal(true);
        (await renExAtomicSwapper.redeemable(swapID)).should.equal(true);

        await renExAtomicSwapper.redeem(swapID, secret, { from: bob });

        (await renExAtomicSwapper.initiatable(swapID)).should.equal(false);
        (await renExAtomicSwapper.refundable(swapID)).should.equal(false);
        (await renExAtomicSwapper.redeemable(swapID)).should.equal(false);

    })
});