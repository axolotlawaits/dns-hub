import { ReactNode } from "react"
import { Link } from "react-router"

type ToolType = {
  name: string
  description: string
  link: string
  svg: ReactNode
}

function Tools({tools}: {tools: ToolType[]}) {
  return (
    <div>
      {tools.map(tool => {
        return (
          <Link to={tool.link} className="tool-card">
            {tool.svg}
            <div className="tool-text">
              <span className="tool-name">{tool.name}</span>
              <span className="tool-description">{tool.description}</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

export default Tools