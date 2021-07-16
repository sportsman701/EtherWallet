import Web3 from 'web3'
import { BigNumber } from 'bignumber.js'
import Transaction from 'ethereumjs-tx'
import { getState } from 'redux/core'
import actions from 'redux/actions'
import reducers from 'redux/core/reducers'
import DEFAULT_CURRENCY_PARAMETERS from 'common/helpers/constants/DEFAULT_CURRENCY_PARAMETERS'
import EVM_CONTRACTS_ABI from 'common/helpers/constants/EVM_CONTRACTS_ABI'
import ethLikeHelper from 'common/helpers/ethLikeHelper'
import * as mnemonicUtils from 'common/utils/mnemonic'
import typeforce from 'swap.app/util/typeforce'
import externalConfig from 'helpers/externalConfig'
import metamask from 'helpers/metamask'
import { feedback, constants, cacheStorageGet, cacheStorageSet, apiLooper } from 'helpers'

class EthLikeAction {
  readonly coinName: string
  readonly ticker: string // upper case (ex. ETH)
  readonly tickerKey: string // lower case (ex. eth)
  readonly privateKeyName: string
  readonly explorerName: string
  readonly explorerLink: string
  readonly explorerApiKey: string
  readonly chainId: string
  readonly adminFeeObj: {
    fee: string // percent of amount
    address: string // where to send
    min: string // min amount
  }
  readonly Web3: IUniversalObj
  private cache = new Map([['addressIsContract', {}]])

  constructor(options) {
    const {
      coinName,
      ticker,
      privateKeyName,
      chainId,
      explorerName,
      explorerLink,
      explorerApiKey,
      adminFeeObj,
      web3,
    } = options

    this.coinName = coinName
    this.ticker = ticker
    this.privateKeyName = privateKeyName.toLowerCase()
    this.chainId = chainId
    this.tickerKey = ticker.toLowerCase()
    this.explorerName = explorerName
    this.explorerLink = explorerLink
    this.explorerApiKey = explorerApiKey
    this.adminFeeObj = adminFeeObj
    this.Web3 = web3
  }

  getCurrentWeb3 = () => metamask.getWeb3() || this.Web3

  getWeb3 = () => {
    return this.getCurrentWeb3()
  }

  reportError = (error) => {
    feedback.actions.failed(
      ''.concat(`details - ticker: ${this.ticker}, `, `error message - ${error.message} `)
    )
    console.group(`Actions >%c ${this.ticker}`, 'color: red;')
    console.error('error: ', error)
    console.groupEnd()
  }

  getPrivateKeyByAddress = (address) => {
    const { user } = getState()
    const currencyData = user[`${this.tickerKey}Data`]
    const currencyMnemonicData = user[`${this.tickerKey}MnemonicData`]

    if (currencyData.address === address) {
      return currencyData.privateKey
    }

    if (currencyMnemonicData?.address === address) {
      return currencyMnemonicData?.privateKey
    }
  }

  getInvoices = () => {
    const address = getState().user[`${this.tickerKey}Data`].address

    return actions.invoices.getInvoices({
      currency: this.ticker,
      address,
    })
  }

  getTx = (txRaw) => {
    return txRaw.transactionHash
  }

  getTxRouter = (txId) => {
    return `/${this.tickerKey}/tx/${txId}`
  }

  getLinkToInfo = (tx) => {
    if (!tx) return
    return `${this.explorerLink}/tx/${tx}`
  }

  fetchBalance = (address): Promise<number> => {
    const Web3 = this.getCurrentWeb3()
    return Web3.eth
      .getBalance(address)
      .then((result) => Number(Web3.utils.fromWei(result)))
      .catch((error) => console.error(error))
  }

  fetchTxInfo = (hash) => {
    const Web3 = this.getCurrentWeb3()
    return new Promise((res, rej) => {
      Web3.eth.getTransaction(hash)
        .then((tx) => {
          const { from, to, value, gas, gasPrice, blockHash } = tx

          const amount = Web3.utils.fromWei(value)
          const minerFee = new BigNumber(Web3.utils.toBN(gas).toNumber())
            .multipliedBy(Web3.utils.toBN(gasPrice).toNumber())
            .dividedBy(1e18)
            .toNumber()

          let adminFee: number | false = false

          if (this.adminFeeObj && to !== this.adminFeeObj.address) {
            const feeFromUsersAmount = new BigNumber(this.adminFeeObj.fee)
              .dividedBy(100)
              .multipliedBy(amount)

            if (new BigNumber(this.adminFeeObj.min).isGreaterThan(feeFromUsersAmount)) {
              adminFee = new BigNumber(this.adminFeeObj.min).toNumber()
            } else {
              adminFee = feeFromUsersAmount.toNumber()
            }
          }

          res({
            amount,
            afterBalance: null,
            receiverAddress: to,
            senderAddress: from,
            minerFee,
            minerFeeCurrency: this.ticker,
            adminFee,
            confirmed: blockHash !== null,
          })
        })
        .catch((error) => rej(error))
    })
  }

  login = (privateKey, mnemonic = '', mnemonicKeys = {}) => {
    let sweepToMnemonicReady = false

    if (privateKey && mnemonic && mnemonicKeys && mnemonicKeys[this.tickerKey] === privateKey) {
      sweepToMnemonicReady = true
    }

    if (!privateKey && mnemonic) {
      sweepToMnemonicReady = true
    }

    const Web3 = this.getCurrentWeb3()
    let data

    if (privateKey) {
      data = Web3.eth.accounts.privateKeyToAccount(privateKey)
    } else {
      if (!mnemonic) {
        mnemonic = mnemonicUtils.getRandomMnemonicWords()
      }

      const accData = this.getWalletByWords(mnemonic)

      privateKey = accData.privateKey
      data = Web3.eth.accounts.privateKeyToAccount(privateKey)
      localStorage.setItem(constants.privateKeyNames[`${this.privateKeyName}Mnemonic`], privateKey)

    }

    localStorage.setItem(constants.privateKeyNames[this.privateKeyName], data.privateKey)

    Web3.eth.accounts.wallet.add(data.privateKey)
    data.isMnemonic = sweepToMnemonicReady

    reducers.user.setAuthData({ name: `${this.tickerKey}Data`, data })

    if (!sweepToMnemonicReady) {
      if (mnemonic === `-`) {
        this.reportError({
          message: 'Sweep. Can not auth. Need new mnemonic or enter own for re-login',
        })
        return
      }

      if (!mnemonicKeys || !mnemonicKeys[this.tickerKey]) {
        this.reportError({
          message: 'Sweep. Can not auth. Login key is undefined',
        })
        return
      }

      const mnemonicData = Web3.eth.accounts.privateKeyToAccount(mnemonicKeys[this.tickerKey])

      Web3.eth.accounts.wallet.add(mnemonicKeys[this.tickerKey])
      mnemonicData.isMnemonic = sweepToMnemonicReady

      reducers.user.addWallet({
        name: `${this.tickerKey}MnemonicData`,
        data: {
          currency: this.ticker,
          fullName: `${this.coinName} (New)`,
          balance: 0,
          isBalanceFetched: false,
          balanceError: null,
          infoAboutCurrency: null,
          ...mnemonicData,
        },
      })

      new Promise(async (resolve) => {
        const balance = await this.fetchBalance(mnemonicData.address)

        reducers.user.setAuthData({
          name: `${this.tickerKey}MnemonicData`,
          data: {
            balance,
            isBalanceFetched: true,
          },
        })
        resolve(true)
      })
    }

    return data.privateKey
  }

  getBalance = (): Promise<number> => {
    const address =
      metamask.isEnabled() && metamask.isConnected()
        ? metamask.getAddress()
        : getState().user[`${this.tickerKey}Data`].address

    const balanceInCache = cacheStorageGet('currencyBalances', `${this.tickerKey}_${address}`)

    if (balanceInCache !== false) {
      reducers.user.setBalance({
        name: `${this.tickerKey}Data`,
        amount: balanceInCache,
      })
      return balanceInCache
    }

    return this.fetchBalance(address)
      .then((balance) => {
        cacheStorageSet('currencyBalances', `${this.tickerKey}_${address}`, balance, 30)
        reducers.user.setBalance({
          name: `${this.tickerKey}Data`,
          amount: balance,
        })
        return balance
      })
      .catch((error) => {
        console.error(error)
        reducers.user.setBalanceError({ name: `${this.tickerKey}Data` })
        return 0
      })
  }

  getAllMyAddresses = () => {
    const { user } = getState()
    const arrOfAddresses: string[] = []
    const mnemonicDataAddress = user[`${this.tickerKey}MnemonicData`]?.address || ''
    const dataAddress = user[`${this.tickerKey}Data`]?.address || ''
    const metamaskAddress: string =
      (metamask && metamask.isEnabled() && metamask.isConnected() && metamask.getAddress()) || ''

    if (dataAddress) {
      arrOfAddresses.push(dataAddress.toLowerCase())
    }

    if (mnemonicDataAddress.toLowerCase() !== dataAddress.toLowerCase()) {
      arrOfAddresses.push(mnemonicDataAddress?.toLowerCase())
    }

    if (metamaskAddress && !arrOfAddresses.includes(metamaskAddress.toLowerCase())) {
      arrOfAddresses.push(metamaskAddress.toLowerCase())
    }

    return arrOfAddresses
  }

  getTransaction = (address: string = ``, ownType: string = ``) => {
    const ownerAddress = getState().user[`${this.tickerKey}Data`].address
    address = address || ownerAddress

    type ResponseItem = {
      value: number
      to: string
      hash: string
    }

    return new Promise((resolve) => {
      if (
        // some blockchains don't have API
        // don't show console errors in these cases
        !this.explorerApiKey ||
        !typeforce.isCoinAddress[this.ticker](address)
      ) {
        resolve([])
      }

      const Web3 = this.getCurrentWeb3()

      const type = ownType || this.tickerKey
      const internalUrl = `?module=account&action=txlistinternal&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${this.explorerApiKey}`
      const url = `?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${this.explorerApiKey}`

      apiLooper
        .get(this.explorerName, internalUrl)
        .then((response: any) => {
          if (Array.isArray(response?.result)) {
            const internals: ResponseItem[] = []
  
            response.result.map((item: ResponseItem) => {
              const { value, to, hash } = item
  
              internals[hash] = {
                value,
                to,
              }
            })
  
            apiLooper
              .get(this.explorerName, url)
              .then((response: any) => {
                if (Array.isArray(response.result)) {
                  const transactions = response.result
                    .filter((item: ResponseItem) => {
                      return (
                        item.value > 0 || (internals[item.hash] && internals[item.hash].value > 0)
                      )
                    })
                    .map((item) => ({
                      type,
                      confirmations: item.confirmations,
                      hash: item.hash,
                      status: item.blockHash !== null ? 1 : 0,
                      value: Web3.utils.fromWei(
                        internals[item.hash] && internals[item.hash].value > 0
                          ? internals[item.hash].value
                          : item.value
                      ),
                      address: item.to,
                      canEdit: address === ownerAddress,
                      date: item.timeStamp * 1000,
                      direction:
                        internals[item.hash] &&
                        internals[item.hash].to.toLowerCase() === address.toLowerCase()
                          ? 'in'
                          : address.toLowerCase() === item.to.toLowerCase()
                          ? 'in'
                          : 'out',
                    }))
                    .filter((item) => {
                      if (item.direction === 'in') return true
                      if (!this.adminFeeObj) return true
                      if (address.toLowerCase() === this.adminFeeObj.address.toLowerCase())
                        return true
                      if (item.address.toLowerCase() === this.adminFeeObj.address.toLowerCase())
                        return false
  
                      return true
                    })
  
                  resolve(transactions)
                } else {
                  resolve([])
                }
              })
              .catch((error) => {
                this.reportError(error)
                resolve([])
              })
          } else {
            resolve([])
          }
        })
        .catch((error) => {
          resolve([])
        })
    })
  }

  getWalletByWords = (mnemonic: string, walletNumber: number = 0, path: string = '') => {
    return mnemonicUtils.getEthLikeWallet({ mnemonic, walletNumber, path })
  }

  getSweepAddress = () => {
    const { user } = getState()

    if (user[`${this.tickerKey}MnemonicData`]?.address) {
      return user[`${this.tickerKey}MnemonicData`].address
    }

    return false
  }

  checkSwapExists = async (params) => {
    const { ownerAddress, participantAddress } = params
    const Web3 = this.getCurrentWeb3()
    const swapContract = new Web3.eth.Contract(EVM_CONTRACTS_ABI.NATIVE_COIN_SWAP, externalConfig.swapContract[this.tickerKey])

    const swap = await swapContract.methods.swaps(ownerAddress, participantAddress).call()
    const balance = swap && swap.balance ? parseInt(swap.balance) : 0

    return balance > 0
  }

  send = async (params): Promise<{ transactionHash: string }> => {
    let { externalAddress, externalPrivateKey, to, amount, gasPrice, gasLimit, speed } = params

    // fake tx - turbo-swaps debug
    // if (false) {
    //   return new Promise(res => res({
    //     transactionHash: '0x58facdbf5023a401f39998179995f0af1e54a64455145df6ed507abdecc1b0a4'
    //   }))
    // }

    const Web3 = this.getCurrentWeb3()

    const haveExternalWallet = externalAddress && !!externalPrivateKey
    const ownerAddress = metamask.isConnected() ? metamask.getAddress() : getState().user[`${this.tickerKey}Data`].address
    const recipientIsContract = await this.isContract(to)

    gasPrice = gasPrice || (await ethLikeHelper[this.tickerKey].estimateGasPrice({ speed }))
    gasLimit =
      gasLimit ||
      (recipientIsContract
        ? DEFAULT_CURRENCY_PARAMETERS.evmLike.limit.contractInteract
        : DEFAULT_CURRENCY_PARAMETERS.evmLike.limit.send)

    if (this.ticker === 'ARBETH') {
      gasLimit = DEFAULT_CURRENCY_PARAMETERS.arbeth.limit.send
    }

    let sendMethod = Web3.eth.sendTransaction
    let txData: any = {
      chainId: this.chainId.replace('0x', ''),
      from: Web3.utils.toChecksumAddress(ownerAddress),
      to: to.trim(),
      gasPrice,
      gas: gasLimit,
      value: Web3.utils.toHex(Web3.utils.toWei(String(amount), 'ether')),
    }

    let privateKey: string | undefined = undefined
    let bufferPrivateKey: Buffer | undefined = undefined

    if (haveExternalWallet) {
      txData.from = externalAddress
      privateKey = externalPrivateKey
    } else {
      privateKey = this.getPrivateKeyByAddress(ownerAddress)
    }

    if (privateKey) {
      bufferPrivateKey = Buffer.from(privateKey?.replace('0x', ''), 'hex')
    }

    const walletData = actions.core.getWallet({
      address: ownerAddress,
      currency: this.ticker,
    })

    if (haveExternalWallet && !walletData?.isMetamask) {
      txData = await this.signTransaction({
        txData,
        privateKey: bufferPrivateKey,
      })
      sendMethod = Web3.eth.sendSignedTransaction
    }

    return new Promise((res, rej) => {
      const receipt = sendMethod(txData)
        .on('transactionHash', (hash) => res({ transactionHash: hash }))
        .on('error', (error) => rej(error))

      if (this.adminFeeObj && !walletData.isMetamask) {
        receipt.then(() => {
          this.sendAdminTransaction({
            from: txData?.from || externalAddress,
            amount,
            gasPrice,
            gasLimit,
            privateKey,
          })
        })
      }
    })
  }

  sendAdminTransaction = async (params): Promise<string> => {
    const {
      from,
      amount,
      gasPrice,
      gasLimit,
      privateKey,
      externalAdminFeeObj,
    } = params
    const adminObj = externalAdminFeeObj || this.adminFeeObj
    const minAmount = new BigNumber(adminObj.min)
    const Web3 = this.getCurrentWeb3()
    const bufferPrivateKey = Buffer.from(privateKey.replace('0x', ''), 'hex')

    let feeFromUsersAmount = new BigNumber(adminObj.fee)
      .dividedBy(100) // 100 %
      .multipliedBy(amount)
      .toNumber()

    if (minAmount.isGreaterThan(feeFromUsersAmount)) {
      feeFromUsersAmount = minAmount.toNumber()
    }

    const txData = {
      chainId: this.chainId,
      from: Web3.utils.toChecksumAddress(from),
      to: adminObj.address.trim(),
      gasPrice,
      gas: gasLimit,
      value: Web3.utils.toHex(
        Web3.utils.toWei(String(feeFromUsersAmount),
        'ether'
      )),
    }

    return new Promise(async (res) => {
      const signedTx = await this.signTransaction({
        txData,
        privateKey: bufferPrivateKey,
      })

      Web3.eth.sendSignedTransaction(signedTx)
        .on('transactionHash', (hash) => {
          console.group('%c Admin commission is sended', 'color: green;')
          console.log('tx hash', hash)
          console.groupEnd()
          res(hash)
        })
    })
  }

  signTransaction = async (params) => {
    const { txData, privateKey } = params
    const Web3 = this.getCurrentWeb3()

    const txCount = await Web3.eth.getTransactionCount(txData.from)
    const nonce = Web3.utils.toHex(txCount)
    const transaction = new Transaction({ ...txData, nonce }, { chainId: this.chainId })

    transaction.sign(privateKey)

    return '0x' + transaction.serialize().toString('hex')
  }

  sweepToMnemonic = (mnemonic, path?) => {
    // ? what's that, how does it work ? Wrong arguments order. Check this.getWalletByWords method
    const wallet = this.getWalletByWords(mnemonic, path)

    window.localStorage.setItem(
      constants.privateKeyNames[`${this.tickerKey}Mnemonic`],
      wallet.privateKey
    )

    return wallet.privateKey
  }

  isSweeped = () => {
    const { user } = getState()

    if (
      user[`${this.tickerKey}Data`]?.address?.toLowerCase() !==
      user[`${this.tickerKey}MnemonicData`]?.address?.toLowerCase()
    ) {
      return false
    }

    return true
  }

  isContract = async (address: string): Promise<boolean> => {
    const lowerAddress = address.toLowerCase()
    const contractsList = this.cache.get('addressIsContract') || {}

    if (contractsList && contractsList[lowerAddress]) {
      return contractsList[lowerAddress]
    }

    const Web3 = this.getCurrentWeb3()

    const codeAtAddress = await Web3.eth.getCode(address)
    const codeIsEmpty = !codeAtAddress || codeAtAddress === '0x' || codeAtAddress === '0x0'

    contractsList[lowerAddress] = !codeIsEmpty

    return !codeIsEmpty
  }

  // ! Delete from project. Temporary
  getReputation = () => Promise.resolve(0)
}

export default {
  ETH: new EthLikeAction({
    coinName: 'Ethereum',
    ticker: 'ETH',
    privateKeyName: 'eth',
    chainId: externalConfig.evmNetworks.ETH.chainId,
    explorerName: 'etherscan',
    explorerLink: externalConfig.link.etherscan,
    explorerApiKey: externalConfig.api.etherscan_ApiKey,
    adminFeeObj: externalConfig.opts?.fee?.eth,
    web3: new Web3(new Web3.providers.HttpProvider(externalConfig.web3.provider)),
  }),
  // use an ethereum private key for EVM compatible blockchains
  BNB: new EthLikeAction({
    coinName: 'Binance Coin',
    ticker: 'BNB',
    privateKeyName: 'eth',
    chainId: externalConfig.evmNetworks.BNB.chainId,
    explorerName: 'bscscan',
    explorerLink: externalConfig.link.bscscan,
    explorerApiKey: externalConfig.api.bscscan_ApiKey,
    adminFeeObj: externalConfig.opts?.fee?.bnb,
    web3: new Web3(new Web3.providers.HttpProvider(externalConfig.web3.binance_provider)),
  }),
  MATIC: new EthLikeAction({
    coinName: 'MATIC Token',
    ticker: 'MATIC',
    privateKeyName: 'eth',
    chainId: externalConfig.evmNetworks.MATIC.chainId,
    explorerName: 'explorer-mumbai',
    explorerLink: externalConfig.link.maticscan,
    explorerApiKey: externalConfig.api.polygon_ApiKey,
    adminFeeObj: externalConfig.opts?.fee?.matic,
    web3: new Web3(new Web3.providers.HttpProvider(externalConfig.web3.matic_provider)),
  }),
  ARBETH: new EthLikeAction({
    coinName: 'Arbitrum ETH',
    ticker: 'ARBETH',
    privateKeyName: 'eth',
    chainId: externalConfig.evmNetworks.ARBETH.chainId,
    explorerName: 'rinkeby-explorer', 
    explorerLink: externalConfig.link.arbitrum,
    explorerApiKey: '',
    adminFeeObj: externalConfig.opts?.fee?.arbeth,
    web3: new Web3(new Web3.providers.HttpProvider(externalConfig.web3.arbitrum_provider)),
  }),
}
