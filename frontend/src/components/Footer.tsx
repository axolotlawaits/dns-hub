import { AppShell } from "@mantine/core"
import { IconBasket, IconBriefcase, IconCube, IconNews } from "@tabler/icons-react"

function Footer() {
  return (
    <AppShell.Footer id="footer-wrapper">
      <div id="footer">
        <div id="footer-nav">
          <a href={`https://dns-shop.ru`} className="footer-nav-option" target="_blank">
            <IconBasket size={35} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">DNS-Shop</span>
              <span className="footer-nav-description">Магазин</span>
            </div>
          </a>
          <a href={`https://dns-zs.partner.ru/uweb`} className="footer-nav-option" target="_blank">
            <IconCube size={35} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">Uweb</span>
              <span className="footer-nav-description">3D планограммы</span>
            </div>
          </a>
          <a href={`https://docs.dns-shop.ru/`} className="footer-nav-option" target="_blank">
            <IconBriefcase size={35} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">Docs</span>
              <span className="footer-nav-description">Документация</span>
            </div>
          </a>
          <a href={`https://ecosystem.dns-shop.ru/stream`} className="footer-nav-option" target="_blank">
            <IconNews size={35} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">EcoSystem</span>
              <span className="footer-nav-description">Новости компании</span>
            </div>
          </a>
        </div>
      </div>
    </AppShell.Footer>
  )
}

export default Footer