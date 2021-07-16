import React, { ReactNode } from 'react'
import cssModules from 'react-css-modules'
import { constants } from 'helpers'
import actions from 'redux/actions'
import { FormattedMessage } from 'react-intl'
import { isMobile } from 'react-device-detect'

import cx from 'classnames'

import Button from 'components/controls/Button/Button'
import FAQ from 'components/FAQ/FAQ'
import { ModalConductorProvider } from 'components/modal'

import styles from './styles.scss'

const isDark = localStorage.getItem(constants.localStorage.isDark)

type ComponentProps = {
  page: 'history' | 'invoices'
  children?: ReactNode
  BalanceForm: ReactNode
}

const DashboardLayout = (props: ComponentProps) => {
  const { children, page } = props

  const balanceRef = React.useRef(null) // Create a ref object

  let activeView = 0

  if (page === 'history' && !isMobile) {
    activeView = 1
  }
  if (page === 'invoices') activeView = 2

  const isSweepReady = localStorage.getItem(constants.localStorage.isSweepReady)
  const isBtcSweeped = actions.btc.isSweeped()
  const isEthSweeped = actions.eth.isSweeped()

  let showSweepBanner = !isSweepReady

  if (isBtcSweeped || isEthSweeped) showSweepBanner = false

  return (
    <article className="data-tut-start-widget-tour">
      {window.CUSTOM_LOGO && <img className="cutomLogo" src={window.CUSTOM_LOGO} alt="logo" />}
      <section
        styleName={`wallet ${window.CUSTOM_LOGO ? 'hasCusomLogo' : ''} ${isDark ? 'dark' : ''}`}
      >
        <div className="data-tut-store" styleName="walletContent" ref={balanceRef}>
          <div styleName="walletBalance">
            {props.BalanceForm}

            <div
              className={cx({
                [styles.desktopEnabledViewForFaq]: true,
                [styles.faqWrapper]: true,
              })}
            >
              <FAQ />
            </div>
          </div>
          <div
            styleName={cx({
              yourAssetsWrapper: activeView === 0,
              activity: activeView === 1 || activeView === 2,
              active: true,
            })}
          >
            {showSweepBanner && (
              <p styleName="sweepInfo">
                <Button blue>
                  <FormattedMessage id="SweepBannerButton" defaultMessage="Done" />
                </Button>
                <FormattedMessage
                  id="SweepBannerDescription"
                  defaultMessage={`Пожалуйста, переместите все средства на кошельки помеченные "new" 
                      (USDT и остальные токены переведите на Ethereum (new) адрес). 
                      Затем нажмите кнопку "DONE". Старые адреса будут скрыты.`}
                />
              </p>
            )}

            <ModalConductorProvider>{children}</ModalConductorProvider>
          </div>
          <div
            className={cx({
              [styles.mobileEnabledViewForFaq]: true,
              [styles.faqWrapper]: true,
            })}
          >
            <FAQ />
          </div>
        </div>
      </section>
    </article>
  )
}

export default cssModules(DashboardLayout, styles, { allowMultiple: true })
