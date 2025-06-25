import { createSignal, createEffect, onCleanup, onMount, Show } from 'solid-js';
import ModalOverlay from './ModalOverlay';
import './ImageOverlay.css';

/**
 * ImageOverlay - Main component for displaying image overlays
 * Supports multiple display modes (modal, side_panel, inline)
 */
function ImageOverlay(props) {
    const { imageOverlayManager, currentHotspot } = props;

    const [isVisible, setIsVisible] = createSignal(false);
    const [currentImage, setCurrentImage] = createSignal(null);
    const [displayMode, setDisplayMode] = createSignal('modal');
    const [isLoading, setIsLoading] = createSignal(false);
    const [hasError, setHasError] = createSignal(false);

    // Store functions in refs to avoid closure issues
    let openHandler = null;
    let closeHandler = null;

    // Setup manager callbacks
    onMount(() => {
        if (!imageOverlayManager) return;

        openHandler = (hotspotId, overlayData) => {
            console.log('Opening overlay for:', hotspotId);

            const imageUrl = overlayData.imageUrls[0];
            if (imageUrl) {
                // Update all states
                setCurrentImage(imageUrl);
                setDisplayMode(overlayData.displayMode || 'modal');
                setIsLoading(true);
                setHasError(false);
                setIsVisible(true);

                // Load image if needed
                const img = imageOverlayManager.getImage(imageUrl);
                if (img) {
                    setIsLoading(false);
                } else {
                    imageOverlayManager.loadImage(imageUrl, hotspotId)
                        .then(() => setIsLoading(false))
                        .catch(() => {
                            setHasError(true);
                            setIsLoading(false);
                        });
                }
            }
        };

        closeHandler = () => {
            setIsVisible(false);
            setCurrentImage(null);
            imageOverlayManager.closeOverlay();
        };

        // Assign handlers
        imageOverlayManager.onOverlayOpen = openHandler;
        imageOverlayManager.onOverlayClose = closeHandler;

        // Cleanup
        onCleanup(() => {
            if (imageOverlayManager) {
                imageOverlayManager.onOverlayOpen = null;
                imageOverlayManager.onOverlayClose = null;
            }
        });
    });

    // Handle ESC key
    createEffect(() => {
        if (!isVisible()) return;

        // Prevent body scroll when modal is open
        document.body.classList.add('modal-open');

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        onCleanup(() => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.classList.remove('modal-open');
        });
    });

    const handleClose = () => {
        if (closeHandler) {
            closeHandler();
        }
    };

    return (
        <Show when={displayMode() === 'modal' && isVisible()}>
            <ModalOverlay
                imageUrl={currentImage()}
                isVisible={true}
                onClose={handleClose}
                hotspotTitle={currentHotspot?.()?.title || "Image"}
                isLoading={isLoading()}
                hasError={hasError()}
            />
        </Show>
    );
}

export default ImageOverlay;