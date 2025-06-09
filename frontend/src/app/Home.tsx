import News from './News';
import Birthday from './Birthday';

function Home() {
  return (
    <div style={{ display: 'flex', width: '100%' }}>
      <div style={{ width: '70%' }}>
        <News />
      </div>
      <div style={{ width: '30%' }}>
        <Birthday />
      </div>
    </div>
  );
}

export default Home;