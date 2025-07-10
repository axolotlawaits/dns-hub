import News from './News';
import Birthday from './Birthday';
import Bookmarks from './Bookmarks';
import Notifications from './Notification'; // Новый компонент для уведомлений

function Home() {
  return (
    <div id='Home' style={{ 
      display: 'flex', 
      width: '100%',
      height: '100vh'
    }}>
      {/* Левая колонка (70% ширины) */}
      <div style={{ 
        width: '70%',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Блок News - 50% высоты левой колонки */}
        <div style={{ 
          height: '30%',
          overflow: 'hidden'
        }}>
          <News />
        </div>
        
        {/* Блок Bookmarks - 50% высоты левой колонки */}
        <div style={{ 
          height: '50%',
          overflow: 'hidden'
        }}>
          <Bookmarks />
        </div>
      </div>
      
      {/* Правая колонка (30% ширины) */}
      <div style={{ 
        width: '30%',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px' // Добавляем отступ между блоками
      }}>
        <div style={{ flex: 1 }}>
            <Notifications /> {/* Новый блок уведомлений */}
        </div>
        <div style={{ flex: 1 }}>
            <Birthday />
        </div>
      </div>
    </div>
  );
}

export default Home;