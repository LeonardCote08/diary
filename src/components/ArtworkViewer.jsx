import { onMount } from 'solid-js';
import OpenSeadragon from 'openseadragon';

function ArtworkViewer() {
    let viewerRef;

    onMount(() => {
        const viewer = OpenSeadragon({
            element: viewerRef,
            tileSources: '/images/tiles/zebra/zebra_output.dzi',
            prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@4.1/build/openseadragon/images/',

            // Options pour une meilleure expérience
            showNavigationControl: true,
            navigationControlAnchor: OpenSeadragon.ControlAnchor.TOP_RIGHT,
            animationTime: 0.5,
            minZoomLevel: 0.5,
            maxZoomPixelRatio: 4,
            visibilityRatio: 0.5,
        });

        console.log('OpenSeadragon viewer initialized');
    });

    return (
        <div
            ref={viewerRef}
            style={{
                width: '100vw',
                height: '100vh',
                background: '#000'
            }}
        />
    );
}

export default ArtworkViewer;