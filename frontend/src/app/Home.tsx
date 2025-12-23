import News from './News';
import Events from './Events';
import Bookmarks from './Bookmarks';
import Poll from './Poll';

function Home() {

  return (
    <div id='Home' style={{ 
      display: 'flex', 
      width: '100%',
      minHeight: '100vh',
      gap: '20px',
      background: 'var(--theme-bg-primary)'
    }}>
      {/* Левая колонка (70% ширины) */}
      <div style={{ 
        width: '70%',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Новости */}
        <div style={{ minHeight: '200px' }}>
          <News />
        </div>
        
        {/* Закладки */}
        <div style={{ minHeight: '400px' }}>
          <Bookmarks />
        </div>
      </div>
      
      {/* Правая колонка (30% ширины) */}
      <div style={{ 
        width: '30%',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* События */}
        <div style={{ flex: 1 }}>
          <Events />
        </div>

        {/* Опросник */}
        <div style={{ flex: 1 }}>
          <Poll />
        </div>
      </div>
    </div>
  );
}

export default Home;