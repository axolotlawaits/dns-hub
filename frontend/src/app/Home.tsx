import News from './News';
import Birthday from './Birthday';
import Bookmarks from './Bookmarks';

function Home() {
  return (
    <div id='Home' style={{ 
      display: 'flex', 
      width: '100%',
      height: '100vh' // Добавляем высоту контейнера
    }}>
      {/* Левая колонка (70% ширины) */}
      <div style={{ 
        width: '70%',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Блок News - 60% высоты левой колонки */}
        <div style={{ 
          height: '50%',
          overflow: 'hidden' // Чтобы контент не выходил за границы
        }}>
          <News />
        </div>
        
        {/* Блок Bookmarks - 40% высоты левой колонки */}
        <div style={{ 
          height: '50%',
          overflow: 'hidden' // Чтобы контент не выходил за границы
        }}>
          <Bookmarks />
        </div>
      </div>
      
      {/* Правая колонка (30% ширины) */}
      <div style={{ width: '30%' }}>
        <Birthday />
      </div>
    </div>
  );
}

export default Home;