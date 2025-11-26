// 1. Initialize the map centered on Belgrade, Blok 30
const map = L.map('mapid').setView([44.8195, 20.4174], 18);

// Google Form pre-filled URL
const GOOGLE_FORM_BASE_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf2Oo5LST0nLDF135VpKvtRxVkb18YZKWcemW30mBJcGQE0qg/viewform';
const FORM_FIELD_TREE_NUMBER = 'entry.2036944082';
const FORM_FIELD_DATE = 'entry.188616753';

// Function to open pre-filled Google Form
function submitWatering(treeNumber, treeSpecies) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1; // JS months are 0-indexed
    const day = today.getDate();

    // Store tree info in localStorage for thank you message
    localStorage.setItem('lastWateredTree', treeNumber);
    localStorage.setItem('lastWateredSpecies', treeSpecies || '');
    localStorage.setItem('lastWateredTime', Date.now().toString());

    const url = `${GOOGLE_FORM_BASE_URL}?usp=pp_url&${FORM_FIELD_TREE_NUMBER}=${encodeURIComponent(treeNumber)}&${FORM_FIELD_DATE}_year=${year}&${FORM_FIELD_DATE}_month=${month}&${FORM_FIELD_DATE}_day=${day}`;
    window.open(url, '_blank');
}

// Check for thank you parameter on page load
function checkThankYouMessage() {
    const urlParams = new URLSearchParams(window.location.search);

    // Only show if thanks=1 AND we have a stored tree number
    if (urlParams.get('thanks') === '1') {
        const treeId = localStorage.getItem('lastWateredTree');
        const treeSpecies = localStorage.getItem('lastWateredSpecies');
        if (treeId) {
            showThankYouModal(treeId, treeSpecies);
            // Clear stored data after showing
            localStorage.removeItem('lastWateredTree');
            localStorage.removeItem('lastWateredSpecies');
            localStorage.removeItem('lastWateredTime');
        }
        // Clean up URL without reloading
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Check when user returns to tab (for mobile browsers)
function setupVisibilityCheck() {
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            const lastWateredTime = localStorage.getItem('lastWateredTime');
            // Show thank you if user returns within 10 minutes of clicking the button
            if (lastWateredTime) {
                const timeDiff = Date.now() - parseInt(lastWateredTime);
                const tenMinutes = 10 * 60 * 1000;
                if (timeDiff < tenMinutes && timeDiff > 3000) { // More than 3 seconds (had time to submit)
                    const treeId = localStorage.getItem('lastWateredTree');
                    const treeSpecies = localStorage.getItem('lastWateredSpecies');
                    if (treeId) {
                        showThankYouModal(treeId, treeSpecies);
                        // Clear stored data after showing
                        localStorage.removeItem('lastWateredTree');
                        localStorage.removeItem('lastWateredSpecies');
                        localStorage.removeItem('lastWateredTime');
                    }
                }
            }
        }
    });
}

// Show thank you modal
function showThankYouModal(treeId, treeSpecies) {
    // Check if species is valid (not null, not empty, doesn't start with "- Stanje:")
    const isValidSpecies = treeSpecies &&
                           treeSpecies.trim() !== '' &&
                           !treeSpecies.startsWith('- Stanje:');
    const treeName = isValidSpecies ? `${treeSpecies} #${treeId}` : `Stablo #${treeId}`;

    const modal = document.createElement('div');
    modal.className = 'thank-you-modal';
    modal.innerHTML = `
        <div class="thank-you-content">
            <div class="thank-you-icon">🌳💧</div>
            <h2>Hvala ti, komšija!</h2>
            <p><strong>${treeName}</strong> ti je zahvalno na zalivanju!</p>
            <p class="thank-you-subtitle">Tvoja briga čini naš kraj zelenijim. Svaka kap vode pomaže!</p>
            <button onclick="closeThankYouModal()" class="thank-you-btn">Nastavi</button>
        </div>
    `;
    document.body.appendChild(modal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeThankYouModal();
    });
}

// Close thank you modal
function closeThankYouModal() {
    const modal = document.querySelector('.thank-you-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 300);
    }
}

// Run on page load
document.addEventListener('DOMContentLoaded', function() {
    checkThankYouMessage();
    setupVisibilityCheck();
});
let geojsonData = null; // Store the original GeoJSON data
let currentLayer = null; // Store the current displayed layer

// 2. Add the base tile layer (OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// 3. Fetch and load the GeoJSON data
const geojsonUrl = 'https://raw.githubusercontent.com/blok30zalivanje/zalivanjeStabala/refs/heads/main/nasastabla.geojson';

fetch(geojsonUrl)
    .then(response => response.json())
    .then(data => {
        geojsonData = data;
        console.log('GeoJSON data loaded:', data);

        // Update total count
        document.getElementById('total-count').textContent = data.features.length;

        // Apply the initial filter (show all)
        updateFilter();
    })
    .catch(error => {
        console.error('Error loading GeoJSON:', error);
        alert('Greška pri učitavanju podataka. Proverite internet konekciju.');
    });

// 4. Function to parse description field to extract structured data
function parseDescription(description) {
    const data = {
        broj_zalivanja_7dana: 0,
        ukupan_broj_zalivanja: 0,
        stanje: 'N/A',
        vrsta: '',
        najbliza_adresa: '',
        omiljeno: 0,
        poslednje_zalivanje: null
    };

    if (!description) return data;

    // Extract broj zalivanja u 7 dana
    const match7dana = description.match(/Broj zalivanja u 7 dana:\s*(\d+)/);
    if (match7dana) {
        data.broj_zalivanja_7dana = parseInt(match7dana[1]);
    }

    // Extract ukupan broj zalivanja
    const matchUkupan = description.match(/Ukupan broj zalivanja:\s*(\d+)/);
    if (matchUkupan) {
        data.ukupan_broj_zalivanja = parseInt(matchUkupan[1]);
    }

    // Extract prijavljeno kao omiljeno
    const matchOmiljeno = description.match(/Prijavljeno kao omiljeno:\s*(\d+)/);
    if (matchOmiljeno) {
        data.omiljeno = parseInt(matchOmiljeno[1]);
    }

    // Extract voda ili kisa (last watering date)
    const matchDatum = description.match(/Voda ili kisa:\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (matchDatum) {
        data.poslednje_zalivanje = matchDatum[1];
    }

    // Extract stanje
    const matchStanje = description.match(/Stanje:\s*([^\n]+)/);
    if (matchStanje) {
        data.stanje = matchStanje[1].trim();
    }

    // Extract vrsta
    const matchVrsta = description.match(/Vrsta:\s*([^\n]+)/);
    if (matchVrsta) {
        data.vrsta = matchVrsta[1].trim();
    }

    // Extract najbliza adresa
    const matchAdresa = description.match(/Najbliza adresa:\s*([^\n]+)/);
    if (matchAdresa) {
        data.najbliza_adresa = matchAdresa[1].trim();
    }

    return data;
}

// Helper function to calculate days since last watering
function getDaysSinceWatering(dateString) {
    if (!dateString) return Infinity;

    try {
        // Parse date in MM/DD/YYYY format
        const parts = dateString.split('/');
        const month = parseInt(parts[0]) - 1; // JS months are 0-indexed
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);

        const wateringDate = new Date(year, month, day);
        const today = new Date();

        // Calculate difference in days
        const diffTime = Math.abs(today - wateringDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        return diffDays;
    } catch (e) {
        return Infinity;
    }
}

// 5. Function to get marker color based on watering count
function getMarkerColor(broj_zalivanja, stanje) {
    if (stanje === 'Suvo' || stanje === 'Izvadjeno') return '#d73027'; // Red for dry/removed trees
    if (broj_zalivanja >= 5) return '#1a9850'; // Dark green for well-watered
    if (broj_zalivanja >= 3) return '#91cf60'; // Light green
    if (broj_zalivanja >= 1) return '#fee08b'; // Yellow
    return '#d73027'; // Red for no watering
}

// 6. Custom filter function
function updateFilter() {
    if (!geojsonData) return; // Wait until data is loaded

    // Get all filter values
    const minWaterings = parseInt(document.getElementById('watering-min').value) || 0;
    const minTotalWaterings = parseInt(document.getElementById('total-watering-min').value) || 0;
    const favoriteFilter = document.getElementById('favorite-filter').value;
    const statusFilter = document.getElementById('status-filter').value;
    const daysSinceFilter = document.getElementById('days-since-watering').value;

    // Remove the current layer if it exists
    if (currentLayer) {
        map.removeLayer(currentLayer);
    }

    let visibleCount = 0;

    // Create a new GeoJSON layer with filtered data
    currentLayer = L.geoJSON(geojsonData, {
        filter: function(feature) {
            // Parse the description to get structured data
            const parsedData = parseDescription(feature.properties.description);

            // Apply all filters
            const meetsWateringCriteria = parsedData.broj_zalivanja_7dana >= minWaterings;
            const meetsTotalWateringCriteria = parsedData.ukupan_broj_zalivanja >= minTotalWaterings;

            // Apply favorite filter
            let meetsFavoriteCriteria = true;
            if (favoriteFilter === 'none') {
                meetsFavoriteCriteria = parsedData.omiljeno === 0;
            } else if (favoriteFilter === 'few') {
                meetsFavoriteCriteria = parsedData.omiljeno <= 1;
            } else if (favoriteFilter === 'some') {
                meetsFavoriteCriteria = parsedData.omiljeno >= 2;
            }

            const meetsStatusCriteria = statusFilter === 'all' || parsedData.stanje === statusFilter;

            // Apply days since watering filter
            let meetsDaysCriteria = true;
            if (daysSinceFilter !== 'all') {
                const daysSince = getDaysSinceWatering(parsedData.poslednje_zalivanje);

                // Parse filter type (max:X or min:X)
                const [filterType, filterValue] = daysSinceFilter.split(':');
                const days = parseInt(filterValue);

                if (filterType === 'max') {
                    // Show trees watered within the last X days
                    meetsDaysCriteria = daysSince <= days;
                } else if (filterType === 'min') {
                    // Show trees NOT watered in the last X days (more than X days)
                    meetsDaysCriteria = daysSince > days;
                }
            }

            const passes = meetsWateringCriteria &&
                          meetsTotalWateringCriteria &&
                          meetsFavoriteCriteria &&
                          meetsStatusCriteria &&
                          meetsDaysCriteria;

            if (passes) visibleCount++;

            return passes;
        },
        pointToLayer: function(feature, latlng) {
            // Parse the description to get structured data
            const parsedData = parseDescription(feature.properties.description);
            const color = getMarkerColor(
                parsedData.broj_zalivanja_7dana,
                parsedData.stanje
            );

            return L.circleMarker(latlng, {
                radius: 8,
                fillColor: color,
                color: '#000',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            });
        },
        onEachFeature: function(feature, layer) {
            // Parse the description to get structured data
            const parsedData = parseDescription(feature.properties.description);
            const props = feature.properties;

            // Calculate days since last watering
            const daysSince = parsedData.poslednje_zalivanje
                ? getDaysSinceWatering(parsedData.poslednje_zalivanje)
                : 'N/A';

            const treeNumber = props.name || '';
            const popupContent = `
                <div class="popup-content">
                    <h3>Stablo #${treeNumber || 'N/A'}</h3>
                    <p><strong>Stanje:</strong> ${parsedData.stanje}</p>
                    <p><strong>Broj zalivanja (7 dana):</strong> ${parsedData.broj_zalivanja_7dana}</p>
                    <p><strong>Ukupno zalivanja:</strong> ${parsedData.ukupan_broj_zalivanja}</p>
                    <p><strong>Omiljeno:</strong> ${parsedData.omiljeno}</p>
                    ${parsedData.poslednje_zalivanje ? `<p><strong>Poslednje zalivanje:</strong> ${parsedData.poslednje_zalivanje} (${daysSince} dana)</p>` : ''}
                    ${parsedData.vrsta ? `<p><strong>Vrsta:</strong> ${parsedData.vrsta}</p>` : ''}
                    ${parsedData.najbliza_adresa ? `<p><strong>Adresa:</strong> ${parsedData.najbliza_adresa}</p>` : ''}
                    ${treeNumber ? `<button class="watering-btn" onclick="submitWatering('${treeNumber}', '${parsedData.vrsta || ''}')">Zalivao sam!</button>` : ''}
                </div>
            `;
            layer.bindPopup(popupContent);
        }
    }).addTo(map);

    // Update visible count
    document.getElementById('visible-count').textContent = visibleCount;

    console.log(`Filter applied: showing ${visibleCount} trees.`);
}

// 7. Reset all filters to default
function resetFilters() {
    document.getElementById('watering-min').value = 0;
    document.getElementById('total-watering-min').value = 0;
    document.getElementById('favorite-filter').value = 'all';
    document.getElementById('status-filter').value = 'all';
    document.getElementById('days-since-watering').value = 'all';
    updateFilter();
}

// 8. Toggle filters on mobile
function toggleFilters() {
    // Only toggle on mobile (< 600px)
    if (window.innerWidth < 600) {
        const controls = document.getElementById('custom-controls');
        controls.classList.toggle('collapsed');
        // Invalidate map size after toggle animation
        setTimeout(() => map.invalidateSize(), 300);
    }
}
