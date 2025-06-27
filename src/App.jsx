import { createSignal, onMount } from 'solid-js';
import ArtworkViewer from './components/ArtworkViewer';
import './App.css';

// Developer message component
function DeveloperMessage({ onClose }) {
    return (
        <div class="developer-message">
            <div class="message-header">
                <h3>Message from Leonard</h3>
                <button class="close-btn" onClick={onClose}>×</button>
            </div>
            <div class="message-content">
                <p>Hey Deji! 👋</p>

                <p>I've been visiting friends and family in my hometown for the past 3 days, so I haven't been able to work as intensively on the project during that time.</p>

                <p>Haha, I totally get the potato mode - we all have it! Though I have to say, your project is so engaging and motivating that it's really kept my creative energy flowing. I've been thinking about it constantly and can't wait to dive back in.</p>

                <p>I'm back home today and excited to dedicate my full attention to the project again. Your feedback was incredibly valuable - I'll be implementing all the adjustments you mentioned progressively. Right now, I'm focusing hard on eliminating the frame drops that occur when clicking on hotspots, both on mobile and desktop. I really want to create the best possible experience with you.</p>

                <p><strong>P.S.</strong> I've temporarily been locked out of Upwork (they flagged some "unusual activity" on my account). They said it should be resolved by Monday, but if you need to reach me before then, I'm available on Telegram: <a href="https://t.me/LeonardCote" target="_blank">@LeonardCote</a></p>

                <p>Looking forward to showing you the improvements!<br />- Leonard</p>
            </div>
        </div>
    );
}

function App() {
    const [loaded, setLoaded] = createSignal(false);
    const [currentArtwork] = createSignal('zebra'); // Will be dynamic later
    const [showMessage, setShowMessage] = createSignal(true);

    const handleCloseMessage = () => {
        setShowMessage(false);
    };

    onMount(() => {
        console.log('Interactive Art Diary loaded');
        setLoaded(true);
    });

    return (
        <div class="app-container">
            {showMessage() && <DeveloperMessage onClose={handleCloseMessage} />}
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