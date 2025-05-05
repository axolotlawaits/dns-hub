import Tools, { Tool } from "../../components/Tools"
import { useEffect, useState } from "react";
import { API } from "../../config/constants";
import { useLocation } from "react-router";

function Supply() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const id = location.state?.id;

  useEffect(() => {
    const fetchTools = async () => {
      if (!id) {
        setIsLoading(false);
        return;
      }
      try {
        const response = await fetch(`${API}/navigation/sub?parent_id=${id}`);
        if (!response.ok) {
          throw new Error('Ошибка при загрузке инструментов');
        }
        const data: Tool[] = await response.json();
        setTools(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTools();
  }, [id]);

  if (isLoading) return <div className="loading">Загрузка...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div>
      <h1>Снабжение</h1>
      <Tools tools={tools} />
    </div>
  );
}

export default Supply