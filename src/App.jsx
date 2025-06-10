import { createSignal, onMount } from 'solid-js';
import './App.css';

function App() {
  const [loaded, setLoaded] = createSignal(false);
  
  onMount(() => {
    console.log('Interactive Art Diary loaded');
    setLoaded(true);
  });

  return (
    <div class="app-container">
      <h1>Interactive Art Diary</h1>
      {loaded() ? (
        <p>Ready to implement the artwork viewer!</p>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}

export default App;