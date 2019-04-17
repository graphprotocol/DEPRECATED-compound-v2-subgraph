import {AccrueInterest, CEther} from "../types/cETH/CEther";
import {Market} from "../types/schema";
import {BigDecimal, Address} from "@graphprotocol/graph-ts/index";
import {getTokenEthRatio, truncateBigDecimal} from "./helpers";
import {CErc20} from "../types/cBAT/CErc20";

export function handleGenericEventTrigger(event: AccrueInterest): void {

  // Preventing this event from calling non existant markets
  if (event.block.number.toI32() > 4193260) {
    marketUpdateCEth()
    marketUpdateCErc20('0x1cae2a350af04cd2525aee6cc8397e03f50c1af4')
    marketUpdateCErc20('0x2acc448d73e8d53076731fea2ef3fc38214d0a7d')
    marketUpdateCErc20('0x1c8f7aca3564c02d1bf58eba8571b6fdafe91f44')
    marketUpdateCErc20('0x961aa80b6b44d445387aa8395c4c6c1a473f4ffd')
  }

}

function marketUpdateCEth(): void {
  let marketID = "0xbed6d9490a7cd81ff0f06f29189160a9641a358f"
  let market = Market.load(marketID)
  let contract = CEther.bind(Address.fromString(marketID))
  if (market == null) {
    market = new Market(marketID)
    market.symbol = contract.symbol()
    market.tokenPerEthRatio = BigDecimal.fromString("1")
    let noTruncRatio = market.tokenPerEthRatio.div(BigDecimal.fromString("0.007")) //TODO - change for mainnet
    market.tokenPerUSDRatio = truncateBigDecimal(noTruncRatio, 18)
  }

  market.accrualBlockNumber = contract.accrualBlockNumber()
  market.totalSupply = contract.totalSupply().toBigDecimal().div(BigDecimal.fromString("100000000"))

  // 10^28, removing 10^18 for exp precision, and then token precision / ctoken precision -> 10^18/10^8 = 10^10
  market.exchangeRate = contract.exchangeRateStored().toBigDecimal()
    .div(BigDecimal.fromString("10000000000000000000000000000"))

  market.totalReserves = contract.totalReserves().toBigDecimal().div(BigDecimal.fromString("1000000000000000000"))
  market.totalBorrows = contract.totalBorrows().toBigDecimal().div(BigDecimal.fromString("1000000000000000000"))
  market.borrowIndex = contract.borrowIndex().toBigDecimal().div(BigDecimal.fromString("1000000000000000000"))

  // Must convert to BigDecimal, and remove 10^18 that is used for Exp in Compound Solidity
  market.perBlockBorrowInterest = contract.borrowRatePerBlock().toBigDecimal().div(BigDecimal.fromString("1000000000000000000"))

  // perBlockSupplyInterest = totalBorrows * borrowRatePerBock * (1-reserveFactor) / (totalSupply * exchangeRate) * 10^18
  let pbsi = market.totalBorrows
    .times(market.perBlockBorrowInterest)
    .times(BigDecimal.fromString("1").minus(contract.reserveFactorMantissa().toBigDecimal()))
    .div(market.totalSupply.times(market.exchangeRate))

  // Then truncate it to be 18 decimal points
  market.perBlockSupplyInterest = truncateBigDecimal(pbsi, 18)

  // Now we must get the true eth balance of the CEther.sol contract
  market.totalCash = contract.getCash().toBigDecimal()
  // deposits = cash + borrows - reserves
  market.totalDeposits = market.totalCash.plus(market.totalBorrows).minus(market.totalReserves)
  market.save()
}

function marketUpdateCErc20(address: string): void {
  let marketID = address
  let market = Market.load(marketID)
  let contract = CErc20.bind(Address.fromString(address))

  // Accrue interest can be called before mint event, so this must be here
  if (market == null) {
    market = new Market(marketID)
    market.symbol = contract.symbol()
    market.tokenPerEthRatio = getTokenEthRatio(market.symbol)
    let noTruncRatio = market.tokenPerEthRatio.div(BigDecimal.fromString("0.007")) //TODO - change for mainnet
    market.tokenPerUSDRatio = truncateBigDecimal(noTruncRatio, 18)
  }

  market.accrualBlockNumber = contract.accrualBlockNumber()
  market.totalSupply = contract.totalSupply().toBigDecimal().div(BigDecimal.fromString("100000000"))

  // 10^28, removing 10^18 for exp precision, and then token precision / ctoken precision -> 10^18/10^8 = 10^10
  market.exchangeRate = contract.exchangeRateStored().toBigDecimal()
    .div(BigDecimal.fromString("10000000000000000000000000000"))

  market.totalReserves = contract.totalReserves().toBigDecimal().div(BigDecimal.fromString("1000000000000000000"))
  market.totalBorrows = contract.totalBorrows().toBigDecimal().div(BigDecimal.fromString("1000000000000000000"))
  market.borrowIndex = contract.borrowIndex().toBigDecimal().div(BigDecimal.fromString("1000000000000000000"))

  // Must convert to BigDecimal, and remove 10^18 that is used for Exp in Compound Solidity
  market.perBlockBorrowInterest = contract.borrowRatePerBlock().toBigDecimal().div(BigDecimal.fromString("1000000000000000000"))

  // perBlockSupplyInterest = totalBorrows * borrowRatePerBock * (1-reserveFactor) / (totalSupply * exchangeRate) * 10^18
  let pbsi = market.totalBorrows
    .times(market.perBlockBorrowInterest)
    .times(BigDecimal.fromString("1").minus(contract.reserveFactorMantissa().toBigDecimal()))
    .div(market.totalSupply.times(market.exchangeRate))

  // Then truncate it to be 18 decimal points
  market.perBlockSupplyInterest = truncateBigDecimal(pbsi, 18)

  // Now we must get the true erc20 balance of the CErc20.sol contract
  // Note we use the CErc20 interface because it is inclusive of ERC20s interface
  let erc20TokenContract = CErc20.bind(contract.underlying())
  let cash = erc20TokenContract.balanceOf(Address.fromString(address))
  market.totalCash = cash.toBigDecimal().div(BigDecimal.fromString("1000000000000000000"))

  // deposits = cash + borrows - reserves
  market.totalDeposits = market.totalCash.plus(market.totalBorrows).minus(market.totalReserves)
  market.save()
}