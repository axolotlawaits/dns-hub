import { AppShell } from "@mantine/core"
import { IconCube } from "@tabler/icons-react"
import { Link } from "react-router"

function Footer() {
  return (
    <div id="footer-wrapper">
      <div id="footer">
        <div id="footer-nav">
          <Link to={`https://dns-zs.partner.ru/uweb`} className="footer-nav-option">
            <IconCube size={30} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">Uweb</span>
              <span className="footer-nav-description">3D планограммы</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Footer