import * as testUtils from "./helper/testUtils";
import { TokenCodes, buyMarket, sellMarket } from "./helper/testUtils";
import { OrderbookContract } from "./bindings/orderbook";
import { RenExSettlementContract } from "./bindings/ren_ex_settlement";
import { RenExBalancesContract } from "./bindings/ren_ex_balances";
import { RenExTokensContract } from "./bindings/ren_ex_tokens";

contract("RenExSettlement", function (accounts: string[]) {

    const darknode = accounts[2];
    const broker = accounts[3];
    let tokenAddresses;
    let orderbook: OrderbookContract;
    let renExSettlement: RenExSettlementContract;
    let renExBalances: RenExBalancesContract;
    let renExTokens: RenExTokensContract;
    let buyID_1, sellID_1;
    let buyID_2, sellID_2;
    let buyID_3, sellID_3;
    let buyID_4;

    const BUY1 = [web3.utils.sha3("0"), 1, buyMarket("0x3", "0x7"), 10, 10000, 0];
    const SELL1 = [web3.utils.sha3("1"), 1, sellMarket("0x3", "0x7"), 10, 1000, 0];
    const BUY2 = [web3.utils.sha3("2"), 1, buyMarket(TokenCodes.BTC, TokenCodes.ETH), 12, 10000, 0];
    const SELL2 = [web3.utils.sha3("3"), 1, sellMarket(TokenCodes.BTC, TokenCodes.ETH), 12, 1000, 0];
    const BUY3 = [web3.utils.sha3("4"), 1, buyMarket(TokenCodes.BTC, TokenCodes.ETH), 15, 10000, 0];
    const SELL3 = [web3.utils.sha3("5"), 1, sellMarket(TokenCodes.BTC, TokenCodes.ETH), 12, 10000, 0];
    const BUY4 = [web3.utils.sha3("6"), 1, buyMarket(TokenCodes.BTC, TokenCodes.ETH), 17, 10000, 0];
    const SELL4 = [web3.utils.sha3("7"), 1, sellMarket(TokenCodes.BTC, TokenCodes.ETH), 12, 1000, 0];
    const SELL5 = [web3.utils.sha3("8"), 2, sellMarket(TokenCodes.BTC, TokenCodes.ETH), 10, 1000, 0];

    before(async function () {
        const ren = await artifacts.require("RepublicToken").deployed();

        tokenAddresses = {
            [TokenCodes.BTC]: testUtils.MockBTC,
            [TokenCodes.ETH]: testUtils.MockETH,
            [TokenCodes.DGX]: await artifacts.require("DGXMock").deployed(),
            [TokenCodes.REN]: ren,
        };

        let dnr = await artifacts.require("DarknodeRegistry").deployed();
        orderbook = await artifacts.require("Orderbook").deployed();
        renExTokens = await artifacts.require("RenExTokens").deployed();
        renExSettlement = await artifacts.require("RenExSettlement").deployed();
        renExBalances = await artifacts.require("RenExBalances").deployed();

        // Broker
        await ren.transfer(broker, testUtils.INGRESS_FEE * 100);
        await ren.approve(orderbook.address, testUtils.INGRESS_FEE * 100, { from: broker });

        // Register darknode
        await ren.transfer(darknode, testUtils.MINIMUM_BOND);
        await ren.approve(dnr.address, testUtils.MINIMUM_BOND, { from: darknode });
        await dnr.register(darknode, testUtils.PUBK("1"), testUtils.MINIMUM_BOND, { from: darknode });
        await testUtils.waitForEpoch(dnr);

        await tokenAddresses[TokenCodes.REN].approve(orderbook.address, 100 * 1e18, { from: broker });

        buyID_1 = await renExSettlement.hashOrder.apply(this, [...BUY1]);
        sellID_1 = await renExSettlement.hashOrder.apply(this, [...SELL1]);

        buyID_2 = await renExSettlement.hashOrder.apply(this, [...BUY2]);
        sellID_2 = await renExSettlement.hashOrder.apply(this, [...SELL2]);

        buyID_3 = await renExSettlement.hashOrder.apply(this, [...BUY3]);
        sellID_3 = await renExSettlement.hashOrder.apply(this, [...SELL3]);

        buyID_4 = await renExSettlement.hashOrder.apply(this, [...BUY4]);

        await testUtils.openBuyOrder(orderbook, broker, accounts[5], buyID_1);
        await testUtils.openBuyOrder(orderbook, broker, accounts[6], buyID_2);
        await testUtils.openBuyOrder(orderbook, broker, accounts[7], buyID_3);
        await testUtils.openBuyOrder(orderbook, broker, accounts[8], buyID_4);

        await testUtils.openSellOrder(orderbook, broker, accounts[6], sellID_1);
        await testUtils.openSellOrder(orderbook, broker, accounts[5], sellID_2);
        await testUtils.openSellOrder(orderbook, broker, accounts[8], sellID_3);

        await orderbook.confirmOrder(buyID_1, sellID_1, { from: darknode });
        await orderbook.confirmOrder(buyID_2, sellID_2, { from: darknode });
        await orderbook.confirmOrder(buyID_3, sellID_3, { from: darknode });
    });

    it("can update orderbook", async () => {
        await renExSettlement.updateOrderbook(testUtils.NULL);
        (await renExSettlement.orderbookContract()).should.equal(testUtils.Ox0);
        await renExSettlement.updateOrderbook(orderbook.address, { from: accounts[1] })
            .should.be.rejectedWith(null, /revert/); // not owner
        await renExSettlement.updateOrderbook(orderbook.address);
        (await renExSettlement.orderbookContract()).should.equal(orderbook.address);
    });

    it("can update renex tokens", async () => {
        await renExSettlement.updateRenExTokens(testUtils.NULL);
        (await renExSettlement.renExTokensContract()).should.equal(testUtils.Ox0);
        await renExSettlement.updateRenExTokens(renExTokens.address, { from: accounts[1] })
            .should.be.rejectedWith(null, /revert/); // not owner
        await renExSettlement.updateRenExTokens(renExTokens.address);
        (await renExSettlement.renExTokensContract()).should.equal(renExTokens.address);
    });

    it("can update renex balances", async () => {
        await renExSettlement.updateRenExBalances(testUtils.NULL);
        (await renExSettlement.renExBalancesContract()).should.equal(testUtils.Ox0);
        await renExSettlement.updateRenExBalances(renExBalances.address, { from: accounts[1] })
            .should.be.rejectedWith(null, /revert/); // not owner
        await renExSettlement.updateRenExBalances(renExBalances.address);
        (await renExSettlement.renExBalancesContract()).should.equal(renExBalances.address);
    });

    it("can update submission gas price limit", async () => {
        await renExSettlement.updateSubmissionGasPriceLimit(testUtils.NULL);
        (await renExSettlement.submissionGasPriceLimit()).toString().should.equal("0");
        await renExSettlement.updateSubmissionGasPriceLimit(100 * testUtils.GWEI, { from: accounts[1] })
            .should.be.rejectedWith(null, /revert/); // not owner
        await renExSettlement.updateSubmissionGasPriceLimit(100 * testUtils.GWEI);
        (await renExSettlement.submissionGasPriceLimit()).toString().should.equal((100 * testUtils.GWEI).toString());
    });

    it("submitOrder", async () => {
        // sellID_1?
        await renExSettlement.submitOrder.apply(this, [...SELL1]);

        // buyID_1?
        await renExSettlement.submitOrder.apply(this, [...BUY1]);

        // sellID_2?
        await renExSettlement.submitOrder.apply(this, [...SELL2]);

        // buyID_2?
        await renExSettlement.submitOrder.apply(this, [...BUY2]);

        // sellID_3?
        await renExSettlement.submitOrder.apply(this, [...SELL3]);

        // buyID_3?
        await renExSettlement.submitOrder.apply(this, [...BUY3]);
    });

    it("submitOrder (rejected)", async () => {
        // Can't submit order twice:
        await renExSettlement.submitOrder.apply(this, [...SELL2])
            .should.be.rejectedWith(null, /order already submitted/);

        // Can't submit order that's not in orderbook (different order details):
        await renExSettlement.submitOrder.apply(this, [...SELL4])
            .should.be.rejectedWith(null, /unconfirmed order/);

        // Can't submit order that's not confirmed
        await renExSettlement.submitOrder.apply(this, [...BUY4])
            .should.be.rejectedWith(null, /unconfirmed order/);
    });

    it("settle checks the buy order status", async () => {
        await renExSettlement.settle(
            testUtils.randomID(),
            sellID_1,
        ).should.be.rejectedWith(null, /invalid buy status/);
    });

    it("settle checks the sell order status", async () => {
        await renExSettlement.settle(
            buyID_1,
            testUtils.randomID(),
        ).should.be.rejectedWith(null, /invalid sell status/);
    });

    it("settle checks that the orders are compatible", async () => {
        // Two buys
        await renExSettlement.settle(
            buyID_1,
            buyID_1,
        ).should.be.rejectedWith(null, /incompatible orders/);

        // Two sells
        await renExSettlement.settle(
            sellID_1,
            sellID_1,
        ).should.be.rejectedWith(null, /incompatible orders/);

        // Orders that aren't matched to one another
        await renExSettlement.settle(
            buyID_2,
            sellID_3,
        ).should.be.rejectedWith(null, /unconfirmed orders/);
    });

    it("settle checks the token registration", async () => {
        // Buy token that is not registered
        await renExSettlement.settle(
            buyID_1,
            sellID_1,
        ).should.be.rejectedWith(null, /unregistered priority token/);

        // Sell token that is not registered
        await renExTokens.deregisterToken(TokenCodes.ETH);
        await renExSettlement.settle(
            buyID_2,
            sellID_2,
        ).should.be.rejectedWith(null, /unregistered secondary token/);
        await renExTokens.registerToken(TokenCodes.ETH, tokenAddresses[TokenCodes.ETH].address, 18);
    });

    it("should fail for excessive gas price", async () => {
        // Set gas price limit to 0
        const previousGasPriceLimit = await renExSettlement.submissionGasPriceLimit();
        await renExSettlement.updateSubmissionGasPriceLimit(0x0);

        await renExSettlement.submitOrder.apply(this, [...SELL5])
            .should.be.rejectedWith(null, /gas price too high/);

        // Reset gas price limit
        await renExSettlement.updateSubmissionGasPriceLimit(previousGasPriceLimit);
    });
});