// components/Tools.tsx
import { Link } from "react-router-dom";
import * as TablerIcons from "@tabler/icons-react";
import '../components/styles/Tools.css';

export interface Tool {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string;
  link: string;
  description: string;
  order: number;
  types: any[];
}

interface ToolsProps {
  tools: Tool[];
}

function Tools({ tools }: ToolsProps) {
  const getIconComponent = (iconName: string) => {
    const IconComponent = TablerIcons[iconName as keyof typeof TablerIcons] as 
      React.ComponentType<{ size?: number; className?: string }> | undefined;
    return IconComponent ? <IconComponent size={64} /> : null;
  };

  return (
    <div className="tools-container">
      {tools.map((tool) => (
        <Link to={`/${tool.link}`} key={tool.id} className="tool-card">
          {getIconComponent(tool.icon)}
          <div className="tool-text">
            <span className="tool-name">{tool.name}</span>
            <span className="tool-description">{tool.description}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default Tools;