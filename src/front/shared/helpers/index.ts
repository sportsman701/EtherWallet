import btc from './btc'
import ghost from './ghost'
import next from './next'
import eth from './eth'
import bnb from './bnb'
import matic from './matic'
import arbeth from './arbeth'
import ethToken from './ethToken'
import * as user from './user'
import web3 from './web3'
import links from './links'
import getCurrencyKey from './getCurrencyKey'
import constants from './constants'
import localStorage from './localStorage'
import api from './api'
import * as utils from './utils'
// Methods
import ignoreProps from './ignoreProps'
import handleGoTrade from './handleGoTrade'
// Getters
import externalConfig from './externalConfig'
import feedback from './feedback'
import getPageOffset from './getPageOffset'
import transactions from './transactions'

import { migrate } from './migrations/'

import { cacheStorageGet, cacheStorageSet } from './cache'

import apiLooper from './apiLooper'
import wpLogoutModal from './wpLogoutModal'


import metamask from './metamask'

import getWalletLink from './getWalletLink'

import redirectTo from './redirectTo'

import adminFee from './adminFee'

import swaps from './swaps'

import stats from './stats.swaponline'

import { getPairFees } from './getPairFees'


export default {
  btc,
  eth,
  bnb,
  matic,
  arbeth,
  ghost,
  next,
  ethToken,
  getCurrencyKey,
  handleGoTrade,
  transactions,
}

export {
  btc,
  eth,
  bnb,
  matic,
  arbeth,
  ghost,
  next,
  ethToken,
  user,
  web3,
  utils,
  links,
  constants,
  localStorage,
  api,
  migrate,
  // Methods
  ignoreProps,
  handleGoTrade,

  // Getters
  getPageOffset,
  externalConfig,

  feedback,
  cacheStorageGet,
  cacheStorageSet,

  apiLooper,

  metamask,

  getWalletLink,

  redirectTo,

  adminFee,

  swaps,

  stats,

  wpLogoutModal,

  getPairFees,
}
export { getItezUrl } from './getItezUrl'
