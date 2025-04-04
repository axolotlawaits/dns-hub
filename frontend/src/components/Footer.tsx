import { IconBasket, IconBriefcase, IconCube, IconNews } from "@tabler/icons-react"
import { Link } from "react-router"

function Footer() {
  return (
    <div id="footer-wrapper">
      <div id="footer">
        <div id="footer-nav">
          <Link to={`https://dns-shop.ru`} className="footer-nav-option">
            <IconBasket size={35} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">DNS-Shop</span>
              <span className="footer-nav-description">Магазин</span>
            </div>
          </Link>
          <Link to={`https://dns-zs.partner.ru/uweb`} className="footer-nav-option">
            <IconCube size={35} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">Uweb</span>
              <span className="footer-nav-description">3D планограммы</span>
            </div>
          </Link>
          <Link to={`https://docs.dns-shop.ru/`} className="footer-nav-option">
            <IconBriefcase size={35} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">Docs</span>
              <span className="footer-nav-description">Документация</span>
            </div>
          </Link>
          <Link to={`https://ecosystem.dns-shop.ru/stream`} className="footer-nav-option">
            <IconNews size={35} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">EcoSystem</span>
              <span className="footer-nav-description">Новости компании</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Footer