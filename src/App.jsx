import { createSignal, onMount } from 'solid-js';
import ArtworkViewer from './components/ArtworkViewer';
import './App.css';

function App() {
    const [loaded, setLoaded] = createSignal(false);
    const [currentArtwork] = createSignal('zebra'); // Will be dynamic later

    onMount(() => {
        console.log('Interactive Art Diary loaded');
        setLoaded(true);
    });

    return (
        <div class="app-container">
            {loaded() ? (
                <ArtworkViewer artworkId={currentArtwork()} />
            ) : (
                <div class="loading-screen">
                    <p>Loading Interactive Art Diary...</p>
                </div>
            )}
        </div>
    );
}

export default App;