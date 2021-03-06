import * as testUtils from "./helper/testUtils";
import { TokenCodes, market } from "./helper/testUtils";

import { settleOrders } from "./helper/settleOrders";
import { BN } from "bn.js";

import { RenExBalancesContract } from "./bindings/ren_ex_balances";
import { RenExSettlementContract } from "./bindings/ren_ex_settlement";
import { DarknodeRewardVaultContract } from "./bindings/darknode_reward_vault";
import { RenExTokensContract } from "./bindings/ren_ex_tokens";
import { OrderbookContract } from "./bindings/orderbook";
import { DarknodeRegistryContract } from "./bindings/darknode_registry";

contract("Slasher", function (accounts: string[]) {

    const slasher = accounts[0];
    const buyer = accounts[1];
    const seller = accounts[2];
    const darknode = accounts[3];
    const broker = accounts[4];

    let dnr: DarknodeRegistryContract;
    let orderbook: OrderbookContract;
    let darknodeRewardVault: DarknodeRewardVaultContract;
    let renExSettlement: RenExSettlementContract;
    let renExBalances: RenExBalancesContract;
    let renExTokens: RenExTokensContract;
    let eth_address: string;
    let details;

    before(async function () {
        const ren = await artifacts.require("RepublicToken").deployed();

        const tokenAddresses = {
            [TokenCodes.BTC]: testUtils.MockBTC,
            [TokenCodes.ETH]: testUtils.MockETH,
            [TokenCodes.LTC]: testUtils.MockBTC,
            [TokenCodes.DGX]: await artifacts.require("DGXMock").deployed(),
            [TokenCodes.REN]: ren,
        };

        dnr = await artifacts.require("DarknodeRegistry").deployed();
        orderbook = await artifacts.require("Orderbook").deployed();
        darknodeRewardVault = await artifacts.require("DarknodeRewardVault").deployed();
        renExSettlement = await artifacts.require("RenExSettlement").deployed();
        renExBalances = await artifacts.require("RenExBalances").deployed();
        // Register extra token
        renExTokens = await artifacts.require("RenExTokens").deployed();
        renExTokens.registerToken(
            TokenCodes.LTC,
            tokenAddresses[TokenCodes.LTC].address,
            await tokenAddresses[TokenCodes.LTC].decimals()
        );

        // Broker
        await ren.transfer(broker, testUtils.INGRESS_FEE * 100);
        await ren.approve(orderbook.address, testUtils.INGRESS_FEE * 100, { from: broker });

        // Register darknode
        await ren.transfer(darknode, testUtils.MINIMUM_BOND);
        await ren.approve(dnr.address, testUtils.MINIMUM_BOND, { from: darknode });
        await dnr.register(darknode, testUtils.PUBK("1"), testUtils.MINIMUM_BOND, { from: darknode });
        await testUtils.waitForEpoch(dnr);

        await renExSettlement.updateSlasher(slasher);

        eth_address = tokenAddresses[TokenCodes.ETH].address;

        details = [buyer, seller, darknode, broker, renExSettlement, renExBalances, tokenAddresses, orderbook, true];
    });

    it("should correctly relocate fees", async () => {
        const tokens = market(TokenCodes.BTC, TokenCodes.ETH);
        const buy = { settlement: 2, tokens, price: 1, volume: 2 /* BTC */, minimumVolume: 1 /* ETH */ };
        const sell = { settlement: 2, tokens, price: 0.95, volume: 1 /* ETH */ };

        let [btcAmount, ethAmount, buyOrderID, _] = await settleOrders.apply(this, [buy, sell, ...details]);
        btcAmount.should.equal(0.975 /* BTC */);
        ethAmount.should.equal(1 /* ETH */);

        let guiltyOrderID = buyOrderID;
        let guiltyAddress = buyer;
        let innocentAddress = seller;

        let feeNum = new BN(await renExSettlement.DARKNODE_FEES_NUMERATOR());
        let feeDen = new BN(await renExSettlement.DARKNODE_FEES_DENOMINATOR());
        let fees = new BN(web3.utils.toWei(feeNum, "ether")).div(feeDen);

        // Store the original balances
        let beforeBurntBalance = new BN(await darknodeRewardVault.darknodeBalances(slasher, eth_address));
        let beforeGuiltyBalance = new BN(await renExBalances.traderBalances(guiltyAddress, eth_address));
        let beforeInnocentBalance = new BN(await renExBalances.traderBalances(innocentAddress, eth_address));

        // Slash the fees
        await renExSettlement.slash(guiltyOrderID, { from: slasher });

        // Check the new balances
        let afterBurntBalance = new BN(await darknodeRewardVault.darknodeBalances(slasher, eth_address));
        let afterGuiltyBalance = new BN(await renExBalances.traderBalances(guiltyAddress, eth_address));
        let afterInnocentBalance = new BN(await renExBalances.traderBalances(innocentAddress, eth_address));

        // Make sure fees were reallocated correctly
        let burntBalanceDiff = afterBurntBalance.sub(beforeBurntBalance);
        let innocentBalanceDiff = afterInnocentBalance.sub(beforeInnocentBalance);
        let guiltyBalanceDiff = afterGuiltyBalance.sub(beforeGuiltyBalance);
        // We expect the slasher to have gained fees

        burntBalanceDiff.should.bignumber.equal(fees);
        // We expect the innocent trader to have gained fees
        innocentBalanceDiff.should.bignumber.equal(fees);
        // We expect the guilty trader to have lost fees twice
        guiltyBalanceDiff.should.bignumber.equal(-fees * 2);
    });

    it("should not slash bonds more than once", async () => {
        const tokens = market(TokenCodes.BTC, TokenCodes.ETH);
        const buy = { settlement: 2, tokens, price: 1, volume: 2 /* BTC */, minimumVolume: 1 /* ETH */ };
        const sell = { settlement: 2, tokens, price: 0.95, volume: 1 /* ETH */ };

        let [, , buyOrderID, sellOrderID] = await settleOrders.apply(this, [buy, sell, ...details]);

        // Slash the fees
        await renExSettlement.slash(sellOrderID, { from: slasher });

        await renExSettlement.slash(sellOrderID, { from: slasher })
            .should.be.rejectedWith(null, /invalid order status/); // already slashed

        await renExSettlement.slash(buyOrderID, { from: slasher })
            .should.be.rejectedWith(null, /invalid order status/); // already slashed
    });

    it("should handle orders if ETH is the low token", async () => {
        const tokens = market(TokenCodes.ETH, TokenCodes.LTC);
        const buy = { settlement: 2, tokens, price: 1, volume: 2 /* ETH */, minimumVolume: 1 /* LTC */ };
        const sell = { settlement: 2, tokens, price: 0.95, volume: 1 /* LTC */ };

        let [, , buyOrderID, _] = await settleOrders.apply(this, [buy, sell, ...details]);

        // Slash the fees
        await renExSettlement.slash(buyOrderID, { from: slasher })
            .should.not.be.rejected;
    });

    it("should not slash non-atomic swap orders", async () => {
        const tokens = market(TokenCodes.ETH, TokenCodes.REN);
        // Highest possible price, lowest possible volume
        const buy = { tokens, price: 1, volume: 2 /* DGX */ };
        const sell = { tokens, price: 0.95, volume: 1 /* REN */ };

        let [, , guiltyOrderID, _] = await settleOrders.apply(this, [buy, sell, ...details]);

        await renExSettlement.slash(guiltyOrderID, { from: slasher })
            .should.be.rejectedWith(null, /slashing non-atomic trade/);
    });

    it("should not slash if unauthorised to do so", async () => {
        const tokens = market(TokenCodes.BTC, TokenCodes.ETH);
        const buy = { settlement: 2, tokens, price: 1, volume: 2 /* BTC */, minimumVolume: 1 /* ETH */ };
        const sell = { settlement: 2, tokens, price: 0.95, volume: 1 /* ETH */ };

        let [, , buyOrderID, sellOrderID] = await settleOrders.apply(this, [buy, sell, ...details]);
        let guiltyTrader = buyer;
        let innocentTrader = seller;

        // The guilty trader might try to dog the innocent trader
        await renExSettlement.slash(sellOrderID, { from: guiltyTrader })
            .should.be.rejectedWith(null, /unauthorised/);

        // The innocent trader might try to dog the guilty trader
        await renExSettlement.slash(buyOrderID, { from: innocentTrader })
            .should.be.rejectedWith(null, /unauthorised/);
    });
});
