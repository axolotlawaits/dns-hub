import News from './News';
import Birthday from './Birthday';
import Bookmarks from './Bookmarks';
import Notifications from '../components/Notifications/Notifications';

function Home() {

  return (
    <div id='Home' style={{ 
      display: 'flex', 
      width: '100%',
      minHeight: '100vh',
      padding: '20px',
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
        {/* Уведомления */}
        <div style={{ flex: 1 }}>
          <Notifications />
        </div>

        {/* Дни рождения */}
        <div style={{ flex: 1 }}>
          <Birthday />
        </div>
      </div>
    </div>
  );
}

export default Home;