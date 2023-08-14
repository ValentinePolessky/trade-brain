class TradeBrain {
    constructor() {
        this.trades = [];
        this.stops = [];
        this.targets = [];
        this.riskPerTrade = 0;
        this.stockPrice = 0;
    }

    getStockPrice() {
        return this.stockPrice;
    }

    setStockPrice(value) {
        this.stockPrice = Number(value);
    }

    getRiskPerTrade() {
        return this.riskPerTrade;
    }

    setRickPerTrade(value) {
        const diff = Number(value) - this.riskPerTrade;
        this.riskPerTrade = Number(value);
    }

    getTrades() {
        return this.trades;
    }

    resetTrades() {
        this.trades = [];
    }

    getStops() {
        return this.stops;
    }

    getTargets() {
        return this.targets;
    }

    getIsShort() {
        const sharesCount = this.getActiveSharesCount();
        return sharesCount ? sharesCount < 0 : null;
    }

    getTotalBuySharesCount() {
        const isShort = this.getIsShort();
        return this.getTrades().reduce(
            (acc, trade) =>
                isShort ?
                    (trade.operationType === 'sell' ? acc + trade.sharesCount : acc) :
                    (trade.operationType === 'buy' ? acc + trade.sharesCount : acc),
            0)
    }

    getActiveSharesCount(trades) {
        return (trades || this.getTrades()).reduce((acc, trade) => acc + trade.sharesCount, 0);
    }

    roundDecimal(num) {
        return Math.round((num + Number.EPSILON) * 100) / 100
    }

    validateSellByPercentExecution({percent}) {
        if (!percent) {
            throw new Error("Percent is missing.");
        }
    }

    sellByPositionPercent({positionPercent, riskLine}) {
        this.validateSellByPercentExecution({percent: positionPercent});
        const sharesCount = this.getActiveSharesCount();
        const isShort = this.getIsShort();
        const sharesToSell = positionPercent === 100 ? sharesCount : Math.floor(sharesCount * positionPercent / 100 * (isShort ? -1 : 1));

        this.sellExistingTrade({
            operationType: isShort ? 'buy' : 'sell',
            riskLine,
            sharesCount: sharesToSell
        })
    }

    executeByRiskPercent({riskPercent, riskLine, operationType}) {
        this.validateSellByPercentExecution({percent: riskPercent, operationType});
        const isShort = this.getIsShort();
        const stockPrice = this.getStockPrice();
        const riskPerTrade = this.getRiskPerTrade();
        const riskAmount = riskPerTrade * riskPercent / 100;
        const priceRiskDiff = isShort ? riskLine - stockPrice : stockPrice - riskLine;

        const sharesCount = Math.floor(riskAmount / priceRiskDiff);

        let calculatedOperationType;
        if (isShort) {
            calculatedOperationType = operationType === 'buy' ? 'sell' : 'buy';
        } else {
            calculatedOperationType = operationType;
        }

        if ((isShort && calculatedOperationType === 'sell') || (!isShort && calculatedOperationType === 'buy')) {
            this.addTrade({
                multiplier: riskPercent / 100,
                operationType: isShort ? operationType : calculatedOperationType,
                riskLine
            })
        } else {
            this.sellExistingTrade({
                operationType: calculatedOperationType,
                riskLine,
                sharesCount
            })
        }
    }

    setTrades(tradesList) {
        const updatedTradesList = [...tradesList];
        if (!this.getActiveSharesCount(updatedTradesList)) {
            this.resetTrades();
        } else {
            this.trades = updatedTradesList;
        }
    }

    validateTradeCreation({operationType, multiplier, riskLine}) {
        const stockPrice = this.getStockPrice();
        const riskPerTrade = this.getRiskPerTrade();

        if (!multiplier) {
            throw new Error("Multiplier is missing.");
        }
        if (operationType === 'sell' && stockPrice > riskLine) {
            throw new Error("To sell risk line should be more than stock price.");
        }
        if (operationType === 'buy' && stockPrice < riskLine) {
            throw new Error("To buy risk line should be less than stock price.");
        }
    }

    addTrade({multiplier, operationType, riskLine}) {
        const stockPrice = this.getStockPrice();
        const riskPerTrade = this.getRiskPerTrade();

        this.validateTradeCreation({operationType, multiplier, riskLine});

        const riskAmount = riskPerTrade * multiplier;
        const isSell = operationType === 'sell';
        const priceRiskDiff = isSell ? riskLine - stockPrice : stockPrice - riskLine;

        const sharesCount = Math.floor(riskAmount / priceRiskDiff);

        const trade = {
            stockPrice, sharesCount: isSell ? sharesCount * -1 : sharesCount, operationType, riskLine
        }
        const updatedTradesList = [...this.getTrades(), trade];
        this.setTrades(updatedTradesList)
    }

    sellExistingTrade({operationType, sharesCount, riskLine}) {
        this.validateSellOperation({sharesCount, riskLine});
        const stockPrice = this.getStockPrice();
        const isShort = this.getIsShort();

        const trade = {
            stockPrice, sharesCount: operationType === 'sell' ? sharesCount * -1 : sharesCount, operationType, riskLine
        }

        const updatedTradesList = [...this.getTrades(), trade];
        this.setTrades(updatedTradesList);
    }

    validateSellOperation({sharesCount, riskLine}) {
        const stockPrice = this.getStockPrice();

        if (!sharesCount || !stockPrice || stockPrice < 0 || !riskLine) {
            throw new Error("Data is missing.");
        }
    }

    validateStopCreation({sharesCount}) {
        const stockPrice = this.getStockPrice();

        if (!sharesCount || !stockPrice || stockPrice < 0) {
            throw new Error("Data is missing.");
        }
    }

    addStop({sharesCount, stockPrice}) {
        this.validateStopCreation({sharesCount, stockPrice});
        this.setStops([...this.stops, {sharesCount, stockPrice}])
    }

    setStops(stops) {
        this.stops = [...stops];
    }

    validateTargetCreation({sharesCount, stockPrice}) {
        if (!sharesCount || !stockPrice || stockPrice < 0) {
            throw new Error("Data is missing.");
        }
    }

    addTarget({sharesCount, stockPrice}) {
        this.validateTargetCreation({sharesCount, stockPrice});
        this.setTargets([...this.targets, {sharesCount, stockPrice}])
    }

    setTargets(targets) {
        this.targets = [...targets];
    }

    getAvgPrice(overrideTrades, isShortOverride) {
        if (this.getTrades().length === 0 && !overrideTrades) {
            return 0;
        }
        const isShort = typeof isShortOverride === 'boolean' ? isShortOverride : this.getIsShort();
        const trades = this.getTrades();

        const totals = (overrideTrades || trades).reduce((acc, trade) => {
            if (trade.sharesCount < 0) {
                acc.totalSellCount += trade.sharesCount * -1;
                acc.totalSellAmount += trade.sharesCount * -1 * trade.stockPrice;
            } else {
                acc.totalBuyCount += trade.sharesCount;
                acc.totalBuyAmount += trade.sharesCount * trade.stockPrice;
            }
            return acc;
        }, {
            totalBuyCount: 0,
            totalBuyAmount: 0,
            totalSellCount: 0,
            totalSellAmount: 0,
        })
        const avg = isShort ? (totals.totalSellAmount / totals.totalSellCount) : (totals.totalBuyAmount / totals.totalBuyCount);
        return this.roundDecimal(avg);
    }

    getRoundtripProfit() {
        const trades = this.getTrades();
        if (trades.length < 2) return 0;

        const avgPrice = this.getAvgPrice();
        const activeShares = this.getActiveSharesCount();

        const totals = trades.reduce((acc, trade, index) => {
            if (!index) {
                acc.currentUnrealizedProfit = trade.stockPrice * trade.sharesCount * (trade.operationType === 'sell' ? -1 : 1);
                acc.processedTrades = [...acc.processedTrades, trade];
                return acc;
            }

            const sharesCount = this.getActiveSharesCount(acc.processedTrades);
            const avgPrice = this.getAvgPrice(acc.processedTrades, sharesCount < 0);
            if (sharesCount < 0 && trade.operationType === 'buy') {
                acc.currentRealizedProfit += (avgPrice - trade.stockPrice) * (trade.sharesCount < 0 ? trade.sharesCount *-1 :trade.sharesCount)
            } else if (sharesCount > 0 && trade.operationType === 'sell') {
                acc.currentRealizedProfit += (trade.stockPrice - avgPrice) * (trade.sharesCount < 0 ? trade.sharesCount *-1 :trade.sharesCount)
            } else if (sharesCount < 0 && trade.operationType === 'sell') {

            }

            acc.processedTrades = [...acc.processedTrades, trade];
            return acc
        }, {
            currentUnrealizedProfit: 0, currentRealizedProfit: 0, processedTrades: []
        })

        return this.roundDecimal(totals.currentRealizedProfit);
    }

    getUnrealizedRoundtripProfit() {
        const availableSharesCount = this.getActiveSharesCount();
        const avgPrice = this.getAvgPrice();
        const stockPrice = this.getStockPrice();
        const isShort = this.getIsShort();
        const priceDiff = isShort ? avgPrice - stockPrice : stockPrice - avgPrice;

        return this.roundDecimal(priceDiff * availableSharesCount * (isShort ? -1 : 1));
    }

    getBERT() {

        const thisManyShares = this.getActiveSharesCount();
        const thisMuchProfit = this.getRoundtripProfit();
        const thisIsBreakEven = this.getAvgPrice();
        const differenceFromEven = (thisMuchProfit / thisManyShares);

        //debugging:
        //console.log(`Shares ${thisManyShares}, Profit ${thisMuchProfit}, Even ${thisIsBreakEven}, DiffFromEven ${differenceFromEven}`)

        return (thisIsBreakEven - differenceFromEven);
    }

    getPercentProtected() {
        const stops = this.getStops();
        const targets = this.getTargets();
        const isShort = this.getIsShort();
        const activeSharesCount = this.getActiveSharesCount();
        const stockPrice = this.getStockPrice();

        const protectedWithTargetsCount = targets.reduce((acc, target) => {
            if (isShort) {
                if (target.stockPrice < stockPrice) {
                    return acc + target.sharesCount;
                }
            } else {
                if (target.stockPrice > stockPrice) {
                    return acc + target.sharesCount;
                }
            }

            return acc;
        }, 0);

        const protectedWithStopsCount = stops.reduce((acc, stop) => {
            if (isShort) {
                if (stop.stockPrice > stockPrice) {
                    return acc + stop.sharesCount;
                }
            } else {
                if (stop.stockPrice < stockPrice) {
                    return acc + stop.sharesCount;
                }
            }

            return acc;
        }, 0);
        const protectedPercentWithStops = Math.floor(protectedWithStopsCount / activeSharesCount * 100);
        const protectedPercentWithTargets = Math.floor(protectedWithTargetsCount / activeSharesCount * 100);

        return {
            protectedPercentWithStops: protectedPercentWithStops || 0,
            protectedPercentWithTargets: protectedPercentWithTargets || 0,
            protectedWithStopsCount,
            protectedWithTargetsCount
        }
    }

    getUpdateOrdersPrediction() {
        const protectedValues = this.getPercentProtected();
        const activeSharesCount = this.getActiveSharesCount();
        const isProtectedWithTargets = !!protectedValues.protectedWithTargetsCount;
        const isProtectedWithStops = !!protectedValues.protectedWithStopsCount;

        const targetsSharesCount = isProtectedWithTargets && protectedValues.protectedWithTargetsCount < activeSharesCount ? activeSharesCount - protectedValues.protectedWithTargetsCount : 0
        const stopsSharesCount = isProtectedWithStops && protectedValues.protectedWithStopsCount < activeSharesCount ? activeSharesCount - protectedValues.protectedWithStopsCount : 0
        return {
            stopsCount: isProtectedWithStops ? 1 : 0,
            stopsSharesCount,
            targetsCount: isProtectedWithTargets ? 1 : 0,
            targetsSharesCount,
        }
    }

    updateOrders() {
        const isShort = this.getIsShort();
        const stockPrice = this.getStockPrice();
        const protectedValues = this.getPercentProtected();
        const activeSharesCount = this.getActiveSharesCount();
        const isProtectedWithTargets = !!protectedValues.protectedWithTargetsCount;
        const isProtectedWithStops = !!protectedValues.protectedWithStopsCount;

        const stops = [...this.getStops()];
        const targets = [...this.getTargets()];

        if (isProtectedWithTargets) {
            const targetsCopy = [...targets];
            for (let i = 0, y = 0; i < activeSharesCount - protectedValues.protectedWithTargetsCount; i++) {
                targetsCopy[y] = {
                    ...targetsCopy[y],
                    sharesCount: targetsCopy[y].sharesCount + 1
                }
                y++;
                if (y === targetsCopy.length) {
                    y = 0;
                }
            }
            this.setTargets([...targetsCopy])
        }

        if (isProtectedWithStops) {
            const stopsCopy = [...stops];
            for (let i = 0, y = 0; i < activeSharesCount - protectedValues.protectedWithStopsCount; i++) {
                stopsCopy[y] = {
                    ...stopsCopy[y],
                    sharesCount: stopsCopy[y].sharesCount + 1
                }
                y++;
                if (y === stopsCopy.length) {
                    y = 0;
                }
            }
            this.setStops([...stops])
        }
    }

    getInfo() {
        const trades = this.getTrades();
        const data = {
            trades: trades,
            stops: this.getStops(),
            targets: this.getTargets(),
            isInRoundtripTrade: !!trades.length,
            isShort: this.getIsShort(),
            avgPrice: this.getAvgPrice(),
            roundtripProfit: this.getRoundtripProfit(),
            unrealizedRoundtripProfit: this.getUnrealizedRoundtripProfit(),
            bert: this.getBERT(),
            lastOperationCount: trades.length ? trades[trades.length - 1].sharesCount : 'N/A',
            executionsCount: trades.length,
            percentProtectedShares: this.getPercentProtected(),
            updateOrdersPrediction: this.getUpdateOrdersPrediction(),
            activeSharesCount: this.getActiveSharesCount(),
            stockPrice: this.getStockPrice(),
        };
        console.log(data);
        return data;
    }
}


window.addEventListener('load', function () {
    const tb = new TradeBrain();

    function getRandomPositiveOrNegative() {
        const randomDecimal = Math.random();

        return randomDecimal < 0.5 ? 1 : -1;
    }

    const getInputValue = (selector) => {
        return document.querySelector(selector)?.value;
    }

    const riskPerTradeInput = document.getElementById('risk-per-trade-input');
    const stockPriceInput = document.getElementById('stock-price-input');
    const sellExistingSharesButton = document.getElementById('sell-existing-shares-button');

    const inputOneSellButton = document.getElementById('input-one-sell-button');
    const inputOneBuyButton = document.getElementById('input-one-buy-button');
    const inputOneErrorBlock = document.getElementById('input-one-error-block');

    const inputTwoSellButton = document.getElementById('input-two-sell-button');
    const inputTwoBuyButton = document.getElementById('input-two-buy-button');
    const inputTwoErrorBlock = document.getElementById('input-two-error-block');

    const addStopButton = document.getElementById('add-stop-button');
    const inputThreeErrorBlock = document.getElementById('input-three-error-block');

    const addTargetButton = document.getElementById('add-target-button');
    const inputFourErrorBlock = document.getElementById('input-four-error-block');

    const inputFiveErrorBlock = document.getElementById('input-five-error-block');

    const updateOrdersButton = document.getElementById('update-orders-button');

    const updateStockPriceButton = document.getElementById('update-input-button');

    const executeRadios = document.querySelectorAll('input[type=radio][name="execute-input"]');

    const render = () => {
        const info = tb.getInfo();
        // if (info.isShort === true) {
        //     inputOneBuyButton.disabled = true;
        //     inputOneSellButton.disabled = false;
        // } else if (info.isShort === false) {
        //     inputOneBuyButton.disabled = false;
        //     inputOneSellButton.disabled = true;
        // } else {
        //     inputOneBuyButton.disabled = false;
        //     inputOneSellButton.disabled = false;
        // }
        document.querySelector('#is-roundtrip-block').innerHTML = info.isInRoundtripTrade ? 'yes' : 'no';
        document.querySelector('#is-short-block').innerHTML = typeof info.isShort === 'boolean' ? info.isShort ? 'short' : 'long' : 'N/A';
        document.querySelector('#break-even-price-block').innerHTML = `${info.avgPrice}`;
        document.querySelector('#roundtrip-pl-block').innerHTML = `${info.roundtripProfit}`;
        document.querySelector('#unrealized-pl-block').innerHTML = `${info.unrealizedRoundtripProfit}`;
        document.querySelector('#bert-block').innerHTML = `${info.bert}`;
        document.querySelector('#last-operation-block').innerHTML = `${info.lastOperationCount}`;
        document.querySelector('#avg-position-block').innerHTML = `${info.activeSharesCount} shares at ${info.avgPrice}`;
        document.querySelector('#shares-avg-count-block').innerHTML = `${info.avgPrice}`;
        document.querySelector('#shares-count-block').innerHTML = `${info.activeSharesCount}`;
        document.querySelector('#stock-price-block').innerHTML = `${info.stockPrice}`;
        document.querySelector('#executions-count-block').innerHTML = `${info.executionsCount}`;
        document.querySelector('#stop-targets-block').innerHTML = `
          <div>
            Stops count: ${info.stops.length}
            <ul>${info.stops.length ? info.stops.map((stop, index) => `<li>Stop #${index + 1} with ${stop.sharesCount} shares, stock price = ${stop.stockPrice}</li>`).join('') : 'No stops yet.'}</ul>
          </div>
          <div>
            Targets count: ${info.targets.length}
            <ul>${info.targets.length ? info.targets.map((target, index) => `<li>Target #${index + 1} with ${target.sharesCount} shares, stock price = ${target.stockPrice}</li>`) : 'No targets yet.'}</ul>
          </div>
        `;
        document.querySelector('#protection-count-block').innerHTML = `<span>${info.percentProtectedShares.protectedPercentWithStops}% w stops</span>${' '}<span>${info.percentProtectedShares.protectedPercentWithTargets}% w targets</span>`;
        document.querySelector('#not-protected-count-block').innerHTML = `<span>${100 - info.percentProtectedShares.protectedPercentWithStops}% w stops</span>${' '}<span>${100 - info.percentProtectedShares.protectedPercentWithTargets}% w targets</span>`;
        document.querySelector('#update-prediction-block').innerHTML = `
          <div>
            <div>
              <span>Update ${info.updateOrdersPrediction.stopsCount} stops w/</span><span>${info.updateOrdersPrediction.stopsSharesCount} shares each</span>
            </div>
            <div>
              <span>Update ${info.updateOrdersPrediction.targetsCount} targets w/</span><span>${info.updateOrdersPrediction.targetsSharesCount} shares each</span>
            </div>
          </div>
        `;
    }

    render();


    const getInputOneData = (operationType) => ({
        riskLine: Number(getInputValue('#risk-line-input') || 0),
        operationType,
        multiplier: Number(getInputValue('[name="trade-risk"]:checked') || 0),
    });

    const getInputTwoData = () => ({
        riskLine: Number(getInputValue('#risk-line-input') || 0),
        riskPercent: Number(getInputValue('#percent-of-risk-input') || 0),
        positionPercent: Number(getInputValue('#percent-of-position-input') || 0),
        executionType: getInputValue('[name="execute-input"]:checked'),
    });

    const getStopInputData = () => ({
        sharesCount: Number(getInputValue('#stop-shares-count') || 0),
        stockPrice: Number(getInputValue('#stop-stock-price') || 0),
    });

    const resetStopInputData = () => {
        document.querySelector('#stop-shares-count').value = '';
        document.querySelector('#stop-stock-price').value = '';
    };

    const getTargetInputData = () => ({
        sharesCount: Number(getInputValue('#target-shares-count') || 0),
        stockPrice: Number(getInputValue('#target-stock-price') || 0),
    });

    const resetTargetInputData = () => {
        document.querySelector('#target-shares-count').value = '';
        document.querySelector('#target-stock-price').value = '';
    };

    const getInputFiveData = (operationType) => ({
        riskLine: Number(getInputValue('#risk-line-input') || 0),
        operationType,
        sharesCount: Number(getInputValue('#existing-shares-sell-count') || 0)
    });

    stockPriceInput.addEventListener('change', (e) => {
        tb.setStockPrice(e.target.value);
        render();
    });

    riskPerTradeInput.addEventListener('change', (e) => {
        tb.setRickPerTrade(e.target.value);
        render();
    });

    sellExistingSharesButton.addEventListener('click', () => {
        try {
            inputFiveErrorBlock.innerHTML = '';
            const isShort = tb.getIsShort();
            tb.sellExistingTrade(getInputFiveData(isShort ? 'buy' : 'sell'));
        } catch (e) {
            inputFiveErrorBlock.innerHTML = e.message
        }
        document.getElementById('existing-shares-sell-count').value = '';
        render();
    });

    inputOneSellButton.addEventListener('click', () => {
        try {
            inputOneErrorBlock.innerHTML = '';
            tb.addTrade(getInputOneData('sell'));
        } catch (e) {
            inputOneErrorBlock.innerHTML = e.message
        }
        render();
    });

    inputOneBuyButton.addEventListener('click', () => {
        try {
            inputOneErrorBlock.innerHTML = '';
            tb.addTrade(getInputOneData('buy'));
        } catch (e) {
            inputOneErrorBlock.innerHTML = e.message
        }
        render();
    });

    inputTwoSellButton.addEventListener('click', () => {
        try {
            inputTwoErrorBlock.innerHTML = '';
            const data = getInputTwoData();
            if (data.executionType === 'positionPercent') {
                tb.sellByPositionPercent(data)
            } else {
                tb.executeByRiskPercent({...data, operationType: 'sell'})
            }
        } catch (e) {
            inputTwoErrorBlock.innerHTML = e.message
        }
        render();
    });

    inputTwoBuyButton.addEventListener('click', () => {
        try {
            inputTwoErrorBlock.innerHTML = '';
            const data = getInputTwoData();
            tb.executeByRiskPercent({...data, operationType: 'buy'})
        } catch (e) {
            inputTwoErrorBlock.innerHTML = e.message
        }
        render();
    });

    addStopButton.addEventListener('click', () => {
        try {
            inputThreeErrorBlock.innerHTML = '';
            const data = getStopInputData();
            tb.addStop(data);
            resetStopInputData();
        } catch (e) {
            inputThreeErrorBlock.innerHTML = e.message;
        }
        render();
    });

    addTargetButton.addEventListener('click', () => {
        try {
            inputFourErrorBlock.innerHTML = '';
            const data = getTargetInputData();
            tb.addTarget(data);
            resetTargetInputData();
        } catch (e) {
            inputFourErrorBlock.innerHTML = e.message;
        }
        render();
    });

    updateOrdersButton.addEventListener('click', () => {
        tb.updateOrders();
        render();
    });

    updateStockPriceButton.addEventListener('click', () => {
        const newStockPrice = Number(tb.getStockPrice()) + (10 * getRandomPositiveOrNegative());
        stockPriceInput.value = newStockPrice;
        tb.setStockPrice(newStockPrice);
        render();
    });

    function changeHandler(event) {
        if (event.target.value === 'riskPercent') {
            inputTwoSellButton.disabled = false;
            inputTwoBuyButton.disabled = false;
        } else if (this.value === 'positionPercent') {
            inputTwoBuyButton.disabled = true;
        }
    }

    Array.prototype.forEach.call(executeRadios, function (radio) {
        radio.addEventListener('change', changeHandler);
    });


});