/* ==========================================================================
   MOTEUR LOGIQUE ET DYNAMIQUE : GENERATEUR DE NOTES DE PERCEPTION
   ========================================================================== */

const API_URL = (() => {
    const origin = window.location.origin || '';
    const protocol = window.location.protocol || '';
    if (origin.startsWith('http://localhost') || origin.startsWith('https://localhost')) {
        return 'http://localhost:3001';
    }
    if (origin === 'null' || origin === '' || protocol === 'file:') {
        return 'https://generateur-fiscal.onrender.com';
    }
    return origin;
})();

// Initialisation au chargement de la page
async function initializeApp() {
    // Pré-remplir l'ordonnateur depuis la session
    const nomOrdonnateur = sessionStorage.getItem('dgrkc_agent_nom');
    if (nomOrdonnateur) {
        document.getElementById('input-ordonnateur').value = nomOrdonnateur;
    }

    // Charger configuration admin depuis l'API
    try {
        const configRes = await fetch(`${API_URL}/api/admin/config`);
        const configs = await configRes.json();
        const config = Array.isArray(configs) && configs.length > 0 ? configs[0] : {};
        
        if (config.entite_fiscale) {
            state.entiteFiscale = config.entite_fiscale;
            state.banque = config.banque;
            state.numeroCompte = config.numero_compte;
            state.antenne = config.antenne;

            const entiteSelect = document.getElementById('input-entite-fiscale');
            const banqueSelect = document.getElementById('input-banque');
            const compteSelect = document.getElementById('input-numero-compte');
            const antenneSelect = document.getElementById('input-antenne');

            entiteSelect.innerHTML = `<option value="">-- Sélectionner --</option><option value="${config.entite_fiscale}">${config.entite_fiscale}</option>`;
            banqueSelect.innerHTML = `<option value="">-- Sélectionner --</option><option value="${config.banque}">${config.banque}</option>`;
            compteSelect.innerHTML = `<option value="">-- Sélectionner --</option><option value="${config.numero_compte}">${config.numero_compte}</option>`;
            antenneSelect.innerHTML = `<option value="">-- Sélectionner --</option><option value="${config.antenne}">${config.antenne}</option>`;

            entiteSelect.value = config.entite_fiscale;
            banqueSelect.value = config.banque;
            compteSelect.value = config.numero_compte;
            antenneSelect.value = config.antenne;
        }
    } catch (err) {
        console.error('Erreur chargement config:', err);
    }

    // Charger clients depuis l'API
    try {
        const clientsRes = await fetch(`${API_URL}/api/clients`);
        const clients = await clientsRes.json();
        window.availableClients = clients;
    } catch (err) {
        console.error('Erreur chargement clients:', err);
    }

    // Générer prochain numéro
    try {
        const numeroRes = await fetch(`${API_URL}/api/numero-next`);
        const { numero } = await numeroRes.json();
        state.numeroNote = numero;
        document.getElementById('input-numero-note').value = numero;
    } catch (err) {
        console.error('Erreur génération numéro:', err);
    }

    // Mettre à jour immédiatement l'aperçu avec les données chargées
    actualiserApercu();
}

// Appeler l'initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', initializeApp);

// 1. État global de l'application
const state = {
    numeroNote: "",
    entiteFiscale: "",
    banque: "",
    numeroCompte: "",
    antenne: "",
    dateEmission: new Date().toISOString().split('T')[0],
    ordonnateur: "",
    redevableNom: "",
    redevableForme: "PM",
    redevableRep: "",
    redevableAdresse: "",
    actes: [
        { id: "1", acte: "", imputation: "", periode: "", exigibilite: "", principal: 0, penalite: 0 }
    ]
};

// Instance du QR Code
let qrcodeInstance = null;

// ==========================================================================
// 0. INITIALISATION PRINCIPALE
// ==========================================================================

const UNITES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
const DIZAINES = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante-dix", "quatre-vingts", "quatre-vingt-dix"];
const EN_LETTRES_10_TO_19 = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];

function convertirNombreEnLettres(nombre) {
    if (isNaN(nombre) || nombre < 0) return "zéro";
    
    // Séparation partie entière et décimale
    const parties = nombre.toFixed(2).split(".");
    const entier = parseInt(parties[0], 10);
    const decimal = parseInt(parties[1], 10);

    let resultat = convertirEntierEnLettres(entier);

    // Gestion des décimales (Prononciation chiffre par chiffre comme dans l'original)
    if (decimal > 0) {
        resultat += " virgule";
        const chiffresDecimaux = parties[1].split("");
        for (let char of chiffresDecimaux) {
            const d = parseInt(char, 10);
            resultat += " " + UNITES[d];
        }
    }

    return resultat.trim().toLowerCase();
}

function convertirEntierEnLettres(nb) {
    if (nb === 0) return "zéro";

    let mots = "";

    // Millions
    if (nb >= 1000000) {
        const millions = Math.floor(nb / 1000000);
        mots += (millions === 1 ? "un" : convertirEntierEnLettres(millions)) + " million" + (millions > 1 ? "s" : "") + " ";
        nb %= 1000000;
    }

    // Milliers
    if (nb >= 1000) {
        const milliers = Math.floor(nb / 1000);
        if (milliers === 1) {
            mots += "mille ";
        } else {
            mots += convertirEntierEnLettres(milliers) + " mille ";
        }
        nb %= 1000;
    }

    // Centaines
    if (nb >= 100) {
        const centaines = Math.floor(nb / 100);
        if (centaines === 1) {
            mots += "cent ";
        } else {
            // RÃ¨gle d'accord : "cents" s'il n'y a rien aprÃ¨s
            const reste = nb % 100;
            mots += UNITES[centaines] + " cent" + (reste === 0 ? "s" : "") + " ";
        }
        nb %= 100;
    }

    // Dizaines et UnitÃ©s
    if (nb > 0) {
        if (nb < 10) {
            mots += UNITES[nb];
        } else if (nb >= 10 && nb < 20) {
            mots += EN_LETTRES_10_TO_19[nb - 10];
        } else {
            const dizaine = Math.floor(nb / 10);
            const unite = nb % 10;
            
            if (dizaine === 7) { // Soixante-dix
                if (unite === 1) {
                    mots += "soixante et onze";
                } else {
                    mots += "soixante-" + EN_LETTRES_10_TO_19[unite];
                }
            } else if (dizaine === 9) { // Quatre-vingt-dix
                if (unite === 1) {
                    mots += "quatre-vingt-onze";
                } else {
                    mots += "quatre-vingt-" + EN_LETTRES_10_TO_19[unite];
                }
            } else if (dizaine === 8) { // Quatre-vingts
                if (unite === 0) {
                    mots += "quatre-vingts";
                } else {
                    mots += "quatre-vingt-" + UNITES[unite];
                }
            } else { // 20, 30, 40, 50, 60
                if (unite === 1) {
                    mots += DIZAINES[dizaine] + " et un";
                } else if (unite > 1) {
                    mots += DIZAINES[dizaine] + "-" + UNITES[unite];
                } else {
                    mots += DIZAINES[dizaine];
                }
            }
        }
    }

    return mots.trim();
}

// Formatage MonÃ©taire
function formaterMontant(valeur) {
    const formatte = new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(valeur);
    // Remplacer l'espace insÃ©cable standard de Intl.NumberFormat par un espace normal
    return formatte.replace(/\u202F/g, ' ') + " CDF";
}

// ==========================================================================
// 3. SYNCHRONISATION ET RENDU DE L'APPLICATION
// ==========================================================================

// Initialisation des icÃ´nes Lucide
function initIcons() {
    lucide.createIcons();
}

// Remplissage initial du formulaire
function chargerFormulaireDepuisEtat() {
    document.getElementById("input-numero-note").value = state.numeroNote;
    document.getElementById("input-entite-fiscale").value = state.entiteFiscale;
    document.getElementById("input-banque").value = state.banque;
    document.getElementById("input-numero-compte").value = state.numeroCompte;
    document.getElementById("input-antenne").value = state.antenne;
    document.getElementById("input-date-emission").value = state.dateEmission;
    document.getElementById("input-ordonnateur").value = state.ordonnateur;
    document.getElementById("input-redevable-nom").value = state.redevableNom;
    document.getElementById("input-redevable-forme").value = state.redevableForme;
    document.getElementById("input-redevable-rep").value = state.redevableRep;
    document.getElementById("input-redevable-adresse").value = state.redevableAdresse;

    renderActesInputs();
    renderSections();
    actualiserApercu();
}

// Rendu des lignes d'actes dans le panneau de gauche
function renderActesInputs() {
    const container = document.getElementById("actes-container");
    container.innerHTML = "";

    state.actes.forEach((acte, index) => {
        const itemCard = document.createElement("div");
        itemCard.className = "acte-item-card";
        itemCard.dataset.id = acte.id;

        itemCard.innerHTML = `
            <div class="acte-card-header">
                <span class="acte-badge">Acte N°${index + 1}</span>
                <button type="button" class="btn-remove-acte" onclick="supprimerActe('${acte.id}')" title="Supprimer cet acte">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>Acte Générateur</label>
                    <input type="text" class="input-acte-nom" value="${acte.acte}" oninput="updateActeValue('${acte.id}', 'acte', this.value)" placeholder="ex: IRV" required>
                </div>
                <div class="form-group">
                    <label>Période</label>
                    <input type="text" class="input-acte-periode" value="${acte.periode}" oninput="updateActeValue('${acte.id}', 'periode', this.value)" placeholder="ex: 2024" required>
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>Principal (CDF)</label>
                    <input type="number" step="0.01" class="input-acte-principal" value="${acte.principal}" oninput="updateActeValue('${acte.id}', 'principal', parseFloat(this.value) || 0)" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label>Pénalité (CDF)</label>
                    <input type="number" step="0.01" class="input-acte-penalite" value="${acte.penalite}" oninput="updateActeValue('${acte.id}', 'penalite', parseFloat(this.value) || 0)" placeholder="0.00" required>
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>Imputation (Optionnel)</label>
                    <input type="text" class="input-acte-imputation" value="${acte.imputation}" oninput="updateActeValue('${acte.id}', 'imputation', this.value)" placeholder="ex: Vignette">
                </div>
                <div class="form-group">
                    <label>Exigibilité (Optionnel)</label>
                    <input type="text" class="input-acte-exigibilite" value="${acte.exigibilite}" oninput="updateActeValue('${acte.id}', 'exigibilite', this.value)" placeholder="ex: Immédiate">
                </div>
            </div>
        `;
        container.appendChild(itemCard);
    });
    initIcons();
}

window.updateActeValue = function(id, field, value) {
    const acte = state.actes.find(a => a.id === id);
    if (acte) {
        acte[field] = value;
        actualiserApercu();
    }
};

window.supprimerActe = function(id) {
    if (state.actes.length <= 1) {
        alert("La note de perception doit comporter au moins un acte générateur.");
        return;
    }
    state.actes = state.actes.filter(a => a.id !== id);
    renderActesInputs();
    actualiserApercu();
}

const btnAddActe = document.getElementById("btn-add-acte");
if (btnAddActe) {
    btnAddActe.addEventListener("click", function(e) {
        e.preventDefault();
        const newId = (Math.max(...state.actes.map(a => parseInt(a.id, 10) || 0)) + 1).toString();
        state.actes.push({
            id: newId,
            acte: "NOUVEL ACTE",
            imputation: "",
            periode: new Date().getFullYear().toString(),
            exigibilite: "",
            principal: 0.00,
            penalite: 0.00
        });
        renderActesInputs();
        actualiserApercu();
        console.log('Acte ajouté! Total:', state.actes.length);
    });
}

// Ã‰vÃ©nements de saisie sur le formulaire principal
document.querySelectorAll(".editor-form input, .editor-form select, .editor-form textarea").forEach(input => {
    input.addEventListener("input", (e) => {
        const id = e.target.id;
        if (id === "input-numero-note") state.numeroNote = e.target.value;
        if (id === "input-entite-fiscale") state.entiteFiscale = e.target.value;
        if (id === "input-banque") state.banque = e.target.value;
        if (id === "input-numero-compte") state.numeroCompte = e.target.value;
        if (id === "input-antenne") state.antenne = e.target.value;
        if (id === "input-date-emission") state.dateEmission = e.target.value;
        if (id === "input-ordonnateur") state.ordonnateur = e.target.value;
        if (id === "input-redevable-nom") state.redevableNom = e.target.value;
        if (id === "input-redevable-forme") state.redevableForme = e.target.value;
        if (id === "input-redevable-rep") state.redevableRep = e.target.value;
        if (id === "input-redevable-adresse") state.redevableAdresse = e.target.value;

        actualiserApercu();
    });
});

// Actualisation dynamique de l'aperÃ§u A4
function actualiserApercu() {
    renderSections();
    
    // 1. Textes administratifs et redevable
    document.getElementById("preview-note-number").innerText = state.numeroNote;
    document.getElementById("preview-entite").innerText = state.entiteFiscale;
    document.getElementById("preview-banque").innerText = state.banque;
    document.getElementById("preview-compte").innerText = state.numeroCompte;
    document.getElementById("preview-redevable-nom").innerText = state.redevableNom;
    document.getElementById("preview-redevable-rep").innerText = state.redevableRep;
    document.getElementById("preview-redevable-forme").innerText = state.redevableForme;
    document.getElementById("preview-redevable-adresse").innerText = state.redevableAdresse;
    document.getElementById("preview-ordonnateur").innerText = state.ordonnateur;

    // Fait Ã ... le...
    document.getElementById("preview-fait-lieu").innerText = state.antenne;
    document.getElementById("stamp-subtext-antenne").innerText = state.antenne;

    // Formater la date en DD/MM/YYYY
    if (state.dateEmission) {
        const parts = state.dateEmission.split("-");
        if (parts.length === 3) {
            document.getElementById("preview-fait-date").innerText = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
            document.getElementById("preview-fait-date").innerText = state.dateEmission;
        }
    }

    // 2. Remplissage du tableau des Actes
    const tableBody = document.getElementById("preview-table-body");
    tableBody.innerHTML = "";

    let grandTotal = 0;

    if (state.actes.length === 0) {
        const emptyRow = document.createElement("tr");
        emptyRow.innerHTML = `
            <td colspan="8" style="text-align: center; padding: 2rem; color: #94a3b8; font-style: italic;">
                Aucun acte saisi. Ajoutez des actes dans la section "Actes Fiscaux" pour voir l'aperçu.
            </td>
        `;
        tableBody.appendChild(emptyRow);
    } else {
        state.actes.forEach((acte, index) => {
            const rowTotal = acte.principal + acte.penalite;
            grandTotal += rowTotal;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="text-center">${index + 1}</td>
                <td class="text-center"><strong>${acte.acte}</strong></td>
                <td class="text-center">${acte.imputation || ""}</td>
                <td class="text-center">${acte.periode}</td>
                <td class="text-center">${acte.exigibilite || ""}</td>
                <td class="text-right">${formaterMontant(acte.principal)}</td>
                <td class="text-right">${formaterMontant(acte.penalite)}</td>
                <td class="text-right"><strong>${formaterMontant(rowTotal)}</strong></td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // 3. Totaux (chiffres & lettres)
    document.getElementById("preview-total-chiffres").innerText = formaterMontant(grandTotal);
    document.getElementById("preview-total-lettres").innerText = convertirNombreEnLettres(grandTotal);

    // 4. RÃ©gÃ©nÃ©ration du Code QR
    actualiserQRCode(grandTotal);
}

// RÃ©gÃ©nÃ©rer le Code QR d'authenticitÃ©
function actualiserQRCode(grandTotal) {
    const qrcodeContainer = document.getElementById("qrcode-canvas");
    qrcodeContainer.innerHTML = ""; // Vider

    const donneesQR = `DGRKC-NOTE-${state.numeroNote}-${state.redevableNom}-${grandTotal.toFixed(2)} CDF`;

    qrcodeInstance = new QRCode(qrcodeContainer, {
        text: donneesQR,
        width: 60,
        height: 60,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}

// ==========================================================================
// 4. ACTIONS GLOBALES & INITIALISATION
// ==========================================================================

// Charger l'exemple fiscal rÃ©el "BAGS & SACKS"
// Charger les données d'exemple (bouton supprimé)
const btnLoadMock = document.getElementById("btn-load-mock");
if (btnLoadMock) {
    btnLoadMock.addEventListener("click", () => {
        state.numeroNote = "24041300002";
        state.entiteFiscale = "SONGOLOLO";
        state.banque = "RAW BANK Matadi Vignette";
        state.numeroCompte = "04000593407-69";
        state.antenne = "SONGOLOLO";
        state.dateEmission = "2024-07-10";
        state.ordonnateur = "DIASIVI KAKINAMBUTAKO STEPHANE";
        state.redevableNom = "BAGS & SACKS SARL";
        state.redevableForme = "PM";
        state.redevableRep = "240413M0002";
        state.redevableAdresse = "3908, Cit Kimpese, T/Songololo, Pr/Kongo-central, P/RDC";
        state.actes = [
            { id: "1", acte: "IRV", imputation: "", periode: "2024", exigibilite: "", principal: 1007805.15, penalite: 0.00 },
            { id: "2", acte: "TSCR", imputation: "", periode: "2024", exigibilite: "", principal: 723410.82, penalite: 0.00 },
            { id: "3", acte: "RAV", imputation: "", periode: "2024", exigibilite: "", principal: 331333.20, penalite: 0.00 }
        ];

        chargerFormulaireDepuisEtat();
    });
}

// RÃ©initialiser la saisie
document.getElementById("btn-reset").addEventListener("click", () => {
    if (confirm("Voulez-vous vraiment réinitialiser le formulaire ?")) {
        // Recharger l'application pour s'assurer d'une réinitialisation complète
        window.location.reload();
    }
});

// Interception de la soumission du formulaire pour l'exportation
document.getElementById("note-form").addEventListener("submit", (e) => {
    e.preventDefault();
    exporterPDF();
});

// Export PDF de haute fidÃ©litÃ©
function exporterPDF() {
    const element = document.getElementById("printable-area");
    
    // Options optimisÃ©es pour html2pdf.js (Pixel-Perfect A4)
    const options = {
        margin: 0,
        filename: `Note_Perception_${state.numeroNote || "00000"}_${state.redevableNom.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { 
            scale: 2.5, // Augmenter la rÃ©solution pour des textes ultra-nets
            useCORS: true, 
            letterRendering: true,
            logging: false
        },
        jsPDF: { 
            unit: 'mm', 
            format: 'a4', 
            orientation: 'portrait' 
        }
    };

    // Lancer la gÃ©nÃ©ration
    html2pdf().from(element).set(options).save();
}

// ==========================================================================
// 5. FONCTION D'EXPORTATION ET UTILITAIRES
// ==========================================================================

// ==========================================================================
// 6. SESSION & AGENT CONNECTÃ‰
// ==========================================================================

function verifierSession() {
    const logged = sessionStorage.getItem("dgrkc_logged");
    if (!logged || logged !== "true") {
        window.location.href = "login.html";
        return false;
    }
    return true;
}

function chargerSession() {
    const nomAgent = sessionStorage.getItem("dgrkc_agent_nom") || "AGENT DGRKC";
    const antenne = sessionStorage.getItem("dgrkc_agent_antenne") || "--";

    // Injecter dans le header
    const navNom = document.getElementById("nav-agent-name");
    const navAntenne = document.getElementById("nav-agent-antenne");
    if (navNom) navNom.innerText = nomAgent;
    if (navAntenne) navAntenne.innerText = "Antenne : " + antenne;

    // PrÃ©-remplir ordonnateur et antenne avec la session (si champs vides)
    const inputOrd = document.getElementById("input-ordonnateur");
    const inputAnt = document.getElementById("input-antenne");
    const inputEntite = document.getElementById("input-entite-fiscale");

    if (inputOrd && !inputOrd.value) {
        inputOrd.value = nomAgent;
        state.ordonnateur = nomAgent;
    }
    if (inputAnt && !inputAnt.value) {
        inputAnt.value = antenne;
        state.antenne = antenne;
    }
    if (inputEntite && !inputEntite.value) {
        inputEntite.value = antenne;
        state.entiteFiscale = antenne;
    }
}

function initHorloge() {
    function tick() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, "0");
        const m = String(now.getMinutes()).padStart(2, "0");
        const s = String(now.getSeconds()).padStart(2, "0");
        const el = document.getElementById("nav-live-time");
        if (el) el.innerText = `${h}:${m}:${s}`;
    }
    tick();
    setInterval(tick, 1000);
}

function initDeconnexion() {
    const btn = document.getElementById("btn-logout");
    if (btn) {
        btn.addEventListener("click", () => {
            if (confirm("Voulez-vous vraiment vous dÃ©connecter ?")) {
                sessionStorage.clear();
                window.location.href = "login.html";
            }
        });
    }
}

// ==========================================================================
// 7. HISTORIQUE LOCAL (localStorage)
// ==========================================================================

const HISTORY_KEY = "dgrkc_historique_notes";

function chargerHistorique() {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
}

function sauvegarderHistorique(historique) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historique));
}

function ajouterNoteAHistorique() {
    const historique = chargerHistorique();

    // Calculer le total
    const total = state.actes.reduce((sum, a) => sum + a.principal + a.penalite, 0);

    const entree = {
        id: Date.now().toString(),
        dateEnregistrement: new Date().toLocaleString("fr-FR"),
        numeroNote: state.numeroNote,
        redevableNom: state.redevableNom,
        entiteFiscale: state.entiteFiscale,
        ordonnateur: state.ordonnateur,
        total: total,
        snapshot: JSON.parse(JSON.stringify(state)) // Copie profonde de l'Ã©tat
    };

    historique.unshift(entree); // Ajouter en tÃªte de liste
    sauvegarderHistorique(historique);
    mettreAJourCompteurs();
    afficherToast("success", "check-circle", "Note sauvegardÃ©e dans l'historique !");
}

function mettreAJourCompteurs() {
    const historique = chargerHistorique();
    const count = historique.length;

    const historyCountEl = document.getElementById("history-count");
    const footerCountEl = document.getElementById("footer-note-count");
    if (historyCountEl) historyCountEl.innerText = count;
    if (footerCountEl) footerCountEl.innerText = count;
}

function renderHistorique(filtre = "") {
    const historique = chargerHistorique();
    const liste = document.getElementById("history-list");
    if (!liste) return;

        const filtrees = filtre
                ? historique.filter(e =>
                        (e.redevableNom || "").toLowerCase().includes(filtre.toLowerCase()) ||
                        (e.numeroNote || "").toLowerCase().includes(filtre.toLowerCase())
                    )
                : historique;

    if (filtrees.length === 0) {
        liste.innerHTML = `
            <div class="history-empty" style="padding:1rem; text-align:center; color:var(--text-muted)">
                <i data-lucide="inbox"></i>
                <p>${filtre ? "Aucune note trouvée." : "Aucune note sauvegardée pour l'instant."}</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    liste.innerHTML = filtrees.map(e => `
        <div class="history-item">
            <div class="info">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem;">
                    <div>
                        <div class="hi-redevable">${e.redevableNom || "(Sans nom)"}</div>
                        <div class="hi-note-num" style="color:var(--text-muted); font-size:0.85rem;">N° ${e.numeroNote || "--"} · ${e.dateEnregistrement}</div>
                    </div>
                    <div class="hi-montant">${formaterMontant(e.total)}</div>
                </div>
            </div>
            <div class="actions">
                <button class="btn btn-secondary btn-xs" onclick="chargerDepuisHistorique('${e.id}')"><i data-lucide="chevrons-left"></i> Charger</button>
                <button class="btn btn-primary btn-xs" onclick="telechargerHistorique('${e.id}')"><i data-lucide="download"></i> Télécharger</button>
            </div>
        </div>
    `).join("");
}

window.chargerDepuisHistorique = function(id) {
    const historique = chargerHistorique();
    const entree = historique.find(e => e.id === id);
    if (!entree) return;

    // Restaurer l'Ã©tat complet
    Object.assign(state, entree.snapshot);

    chargerFormulaireDepuisEtat();
    fermerHistorique();
    afficherToast("success", "file-text", `Note "${entree.redevableNom}" rechargée !`);
};

window.telechargerHistorique = function(id) {
    const historique = chargerHistorique();
    const entree = historique.find(e => e.id === id);
    if (!entree) return;
    // Restaurer l'état avant export
    Object.assign(state, entree.snapshot);
    chargerFormulaireDepuisEtat();
    try {
        exporterPDF();
        afficherToast("success", "file-down", `Téléchargement de "${entree.redevableNom}" lancé.`);
    } catch (err) {
        console.error('Erreur téléchargement historique:', err);
        afficherToast("error", "alert-circle", `Échec du téléchargement.`);
    }
};

function initHistorique() {
    const btnSave = document.getElementById("btn-save-history");
    const btnShow = document.getElementById("btn-show-history");
    const btnClose = document.getElementById("btn-close-history");
    const overlay = document.getElementById("history-overlay");
    const searchInput = document.getElementById("history-search-input");

    if (btnSave) btnSave.addEventListener("click", () => ajouterNoteAHistorique());

    if (btnShow) btnShow.addEventListener("click", () => {
        renderHistorique();
        if (overlay) {
            overlay.style.display = 'block';
            overlay.classList.add("open");
        }
        lucide.createIcons();
    });

    if (btnClose) btnClose.addEventListener("click", fermerHistorique);

    // Cliquer hors du panneau ferme l'overlay
    if (overlay) overlay.addEventListener("click", (e) => {
        if (e.target === overlay) fermerHistorique();
    });


    if (searchInput) searchInput.addEventListener("input", (e) => {
        renderHistorique(e.target.value);
    });

    mettreAJourCompteurs();
}

function fermerHistorique() {
    const overlay = document.getElementById("history-overlay");
    if (overlay) overlay.classList.remove("open");
    if (overlay) overlay.style.display = 'none';
}

// ==========================================================================
// 8. IMPORT / EXPORT JSON
// ==========================================================================

function initImportExport() {
    // Export JSON
    const btnExport = document.getElementById("btn-export-json");
    if (btnExport) {
        btnExport.addEventListener("click", () => {
            const json = JSON.stringify(state, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Note_${state.numeroNote || "brouillon"}_${state.redevableNom.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
            a.click();
            URL.revokeObjectURL(url);
            afficherToast("success", "file-down", "Note exportÃ©e en JSON avec succÃ¨s !");
        });
    }

    // Import JSON
    const inputImport = document.getElementById("btn-import-json");
    if (inputImport) {
        inputImport.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    // Validation minimale
                    if (!data.actes || !Array.isArray(data.actes)) {
                        throw new Error("Format invalide");
                    }
                    Object.assign(state, data);
                    chargerFormulaireDepuisEtat();
                    afficherToast("success", "file-up", `Note de "${data.redevableNom}" importÃ©e !`);
                } catch (err) {
                    afficherToast("error", "alert-circle", "Fichier JSON invalide ou corrompu.");
                }
            };
            reader.readAsText(file);
            // RÃ©initialiser l'input pour permettre de recharger le mÃªme fichier
            e.target.value = "";
        });
    }
}

// ==========================================================================
// 9. NOTIFICATIONS TOAST
// ==========================================================================

function afficherToast(type, icon, message) {
    // Supprimer les toasts existants
    document.querySelectorAll(".toast").forEach(t => t.remove());

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i data-lucide="${icon}"></i><span>${message}</span>`;
    document.body.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(20px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ==========================================================================
// 10. SURCHARGE : GÃ‰NÃ‰RER PDF & SAUVEGARDER EN MÃŠME TEMPS
// ==========================================================================

// On surcharge l'Ã©vÃ©nement submit pour aussi sauvegarder automatiquement
document.getElementById("note-form").addEventListener("submit", (e) => {
    e.preventDefault();
    ajouterNoteAHistorique(); // Auto-sauvegarde Ã  chaque gÃ©nÃ©ration PDF
    exporterPDF();
});

// ==========================================================================
// 11. INITIALISATION PRINCIPALE
// ==========================================================================

window.addEventListener("DOMContentLoaded", () => {
    // 0. Initialiser les boutons AVANT de vérifier la session
    const btnAddActe = document.getElementById("btn-add-acte");
    if (btnAddActe) {
        btnAddActe.addEventListener("click", function(e) {
            e.preventDefault();
            const newId = (Math.max(...state.actes.map(a => parseInt(a.id, 10) || 0)) + 1).toString();
            state.actes.push({
                id: newId,
                acte: "NOUVEL ACTE",
                imputation: "",
                periode: new Date().getFullYear().toString(),
                exigibilite: "",
                principal: 0.00,
                penalite: 0.00
            });
            renderActesInputs();
            actualiserApercu();
            console.log('✓ Acte ajouté! Total:', state.actes.length);
        });
    }
    
    // Initialiser les événements de saisie AVANT de vérifier la session
    document.querySelectorAll(".editor-form input, .editor-form select, .editor-form textarea").forEach(input => {
        input.addEventListener("input", (e) => {
            const id = e.target.id;
            if (id === "input-numero-note") state.numeroNote = e.target.value;
            if (id === "input-entite-fiscale") state.entiteFiscale = e.target.value;
            if (id === "input-banque") state.banque = e.target.value;
            if (id === "input-numero-compte") state.numeroCompte = e.target.value;
            if (id === "input-antenne") state.antenne = e.target.value;
            if (id === "input-date-emission") state.dateEmission = e.target.value;
            if (id === "input-ordonnateur") state.ordonnateur = e.target.value;
            if (id === "input-redevable-nom") state.redevableNom = e.target.value;
            if (id === "input-redevable-forme") state.redevableForme = e.target.value;
            if (id === "input-redevable-rep") state.redevableRep = e.target.value;
            if (id === "input-redevable-adresse") state.redevableAdresse = e.target.value;
            actualiserApercu();
        });
    });
    
    // 1. Vérifier la session (redirige si non connecté)
    if (!verifierSession()) return;

    // 2. Charger le formulaire avec les données par défaut
    chargerFormulaireDepuisEtat();

    // 3. Injecter les infos de l'agent connecté
    chargerSession();
    actualiserApercu();

    // 4. Démarrer les modules
    initHorloge();
    initDeconnexion();
    initHistorique();
    initImportExport();

    // 5. Initialiser les icônes Lucide
    lucide.createIcons();
});

// ==========================================================================
// GESTIONNAIRE DES ONGLETS (TABS NAVIGATION)
// ==========================================================================
document.addEventListener('DOMContentLoaded', function() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            // Retirer active de tous les boutons et panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Ajouter active au bouton et pane cliquÃ©
            this.classList.add('active');
            document.getElementById(`tab-`+tabName).classList.add('active');
        });
    });
});
// ==========================================================================
// GÃ‰NÃ‰RATION DES SECTIONS I, II, III
// ==========================================================================
function renderSections() {
    const placeholder = document.querySelector('.sections-placeholder');
    if (!placeholder) return;

    const sectionsHTML = `
        <table class="main-doc-table">
            <!-- Ligne 1: Sections I & II -->
            <tr>
                <td class="cell-section-1" style="width: 50%;">
                    <div class="section-title-bar">I. RESERVE A L'ADMINISTRATION</div>
                    <div class="section-content-box">
                        <div class="info-row">
                            <span class="info-label">Entité Fiscale</span>
                            <span class="info-separator">:</span>
                            <span class="info-value text-uppercase" id="preview-entite">-</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Banque</span>
                            <span class="info-separator">:</span>
                            <span class="info-value" id="preview-banque">-</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">N° Compte</span>
                            <span class="info-separator">:</span>
                            <span class="info-value" id="preview-compte">-</span>
                        </div>
                    </div>
                </td>
                <td class="cell-section-2" style="width: 50%;">
                    <div class="section-title-bar">II. RENSEIGNEMENT SUR LE REDEVABLE</div>
                    <div class="section-content-box">
                        <div class="info-row">
                            <span class="info-label">Nom ou RS</span>
                            <span class="info-separator">:</span>
                            <span class="info-value text-uppercase" id="preview-redevable-nom">-</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">N° Rép.</span>
                            <span class="info-separator">:</span>
                            <span class="info-value" id="preview-redevable-rep">-</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">F. Juridique</span>
                            <span class="info-separator">:</span>
                            <span class="info-value" id="preview-redevable-forme">-</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label font-address">Adresse</span>
                            <span class="info-separator">:</span>
                            <span class="info-value address-text" id="preview-redevable-adresse">-</span>
                        </div>
                    </div>
                </td>
            </tr>
            
            <!-- Ligne 2: Section III -->
            <tr>
                <td colspan="2" class="cell-section-3">
                    <div class="section-title-bar">III. DETAIL SUR L'ACTE GENERATEUR</div>
                    <div class="section-content-box">
                        <table class="actes-table">
                            <thead>
                                <tr>
                                    <th style="width: 4%;">N°</th>
                                    <th style="width: 12%;">Acte Générateur</th>
                                    <th style="width: 11%;">Imputation</th>
                                    <th style="width: 8%;">Période</th>
                                    <th style="width: 9%;">Exigibilité</th>
                                    <th style="width: 18%;">Principal</th>
                                    <th style="width: 18%;">Pénalité</th>
                                    <th style="width: 20%;">Total</th>
                                </tr>
                            </thead>
                            <tbody id="preview-table-body">
                                <!-- Rempli dynamiquement -->
                            </tbody>
                        </table>
                        
                        <div class="section-three-totals">
                            <div class="total-row">
                                <span class="total-label">MONTANT A PAYER (en chiffre)</span>
                                <span class="total-separator">:</span>
                                <span class="total-value"><strong id="preview-total-chiffres">-</strong></span>
                            </div>
                            <div class="total-row">
                                <span class="total-label">MONTANT A PAYER (en lettre)</span>
                                <span class="total-separator">:</span>
                                <span class="total-value"><strong id="preview-total-lettres">-</strong></span>
                            </div>
                        </div>
                        
                        <div class="section-three-signatures">
                            <div class="sig-left">
                                <div class="ordonnateur-title">Nom de l'ordonnateur</div>
                                <div class="ordonnateur-name" id="preview-ordonnateur">-</div>
                            </div>
                            <div class="sig-right">
                                <div class="fait-date-line">Fait à <span id="preview-fait-lieu">-</span>, le <span id="preview-fait-date">-</span></div>
                                <div class="sig-title">Signature et sceau</div>
                                <div class="signatures-wrapper">
                                    <div class="signature-simulation"></div>
                                    <div class="official-stamp-simulation">
                                        <div class="stamp-circle-inner">
                                            <span>DGR/KC</span>
                                            <span class="stamp-subtext" id="stamp-subtext-antenne">-</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
            
            <!-- Ligne 3: Section IV -->
            <tr>
                <td colspan="2" class="cell-section-4">
                    <div class="section-title-bar">IV. RESERVE A LA COMPTABILITE PUBLIQUE</div>
                    <div class="section-content-box">
                        <div class="compta-top-row">
                            <div class="compta-inputs">
                                <div class="compta-row">
                                    BORDEREAU DE VERSEMENT N° <span class="dots-line">................................................................</span> du <span class="dots-line">...../...../.....</span>
                                </div>
                                <div class="compta-row">
                                    ORDRE DE VIREMENT N° <span class="dots-line">................................................................</span> du <span class="dots-line">...../...../.....</span>
                                </div>
                                <div class="compta-row">
                                    NOM DE LA BANQUE : <span class="dots-line">................................................................................................................</span>
                                </div>
                                <div class="compta-row">
                                    NUMERO CHEQUE : <span class="dots-line">......................................................................................................................</span>
                                </div>
                            </div>
                            <div class="compta-qrcode">
                                <div id="qrcode-canvas"></div>
                                <div class="qrcode-caption">Code d'Authentification</div>
                            </div>
                        </div>
                        
                        <div class="compta-bottom-row">
                            <div class="compta-col">Nom du comptable</div>
                            <div class="compta-col">Signature</div>
                            <div class="compta-col">Date</div>
                            <div class="compta-col">Sceau</div>
                        </div>
                    </div>
                </td>
            </tr>
        </table>
    `;

    placeholder.innerHTML = sectionsHTML;
}




// Gestionnaire d'onglets immédiat (independant de la session)

// ==========================================================================
// CHARGEMENT DES DONNÉES DEPUIS L'API
// ==========================================================================

async function chargerClientsEtConfig() {
    try {
        // Charger les clients
        const clientsRes = await fetch(`${API_URL}/api/clients`);
        const clients = await clientsRes.json();

        const selectRedevable = document.getElementById('input-redevable-nom');
        selectRedevable.innerHTML = '<option value="">-- Sélectionner un client --</option>';

        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.nom;
            option.dataset.id = client.id;
            option.dataset.forme = client.forme;
            option.dataset.rep = client.numero_rep;
            option.dataset.adresse = client.adresse;
            option.textContent = client.nom;
            selectRedevable.appendChild(option);
        });

        // Charger TOUTES les configurations
        const configRes = await fetch(`${API_URL}/api/admin/config`);
        const configs = await configRes.json();

        if (Array.isArray(configs) && configs.length > 0) {
            // Charger les banques avec tous leurs éléments attachés
            const selectBanque = document.getElementById('input-banque');
            selectBanque.innerHTML = '<option value="">-- Sélectionner --</option>';
            
            configs.forEach(config => {
                const option = document.createElement('option');
                option.value = config.banque;
                option.dataset.id = config.id;
                option.dataset.entite = config.entite_fiscale;
                option.dataset.numeroCompte = config.numero_compte;
                option.dataset.antenne = config.antenne;
                option.textContent = config.banque;
                selectBanque.appendChild(option);
            });

            // Charger les autres selects avec les valeurs de la première configuration
            const config = configs[0];

            const selectEntite = document.getElementById('input-entite-fiscale');
            selectEntite.innerHTML = '<option value="">-- Sélectionner --</option>';
            configs.forEach(cfg => {
                const option = document.createElement('option');
                option.value = cfg.entite_fiscale;
                option.textContent = cfg.entite_fiscale;
                selectEntite.appendChild(option);
            });
            selectEntite.value = config.entite_fiscale;

            const selectAntenne = document.getElementById('input-antenne');
            selectAntenne.innerHTML = '<option value="">-- Sélectionner --</option>';
            configs.forEach(cfg => {
                const option = document.createElement('option');
                option.value = cfg.antenne;
                option.textContent = cfg.antenne;
                selectAntenne.appendChild(option);
            });
            selectAntenne.value = config.antenne;

            const selectCompte = document.getElementById('input-numero-compte');
            selectCompte.innerHTML = '<option value="">-- Sélectionner --</option>';
            selectCompte.value = config.numero_compte;

            // Mettre à jour l'état
            state.entiteFiscale = config.entite_fiscale;
            state.banque = config.banque;
            state.numeroCompte = config.numero_compte;
            state.antenne = config.antenne;

            // Mettre à jour immédiatement l'aperçu et le formulaire
            actualiserApercu();
        }
    } catch (err) {
        console.error('Erreur chargement données:', err);
    }
}

// Quand une banque est sélectionnée, charger tous ses éléments attachés
document.getElementById('input-banque').addEventListener('change', (e) => {
    const option = e.target.options[e.target.selectedIndex];
    if (option.dataset.entite) {
        // Mettre à jour les autres champs avec les valeurs de cette banque
        document.getElementById('input-entite-fiscale').value = option.dataset.entite;
        document.getElementById('input-numero-compte').value = option.dataset.numeroCompte || '';
        document.getElementById('input-antenne').value = option.dataset.antenne || '';
        
        // Mettre à jour l'état
        state.banque = option.value;
        state.entiteFiscale = option.dataset.entite;
        state.numeroCompte = option.dataset.numeroCompte || '';
        state.antenne = option.dataset.antenne || '';
        
        // Mettre à jour l'aperçu
        actualiserApercu();
    }
});

// Quand un client est sélectionné, remplir les autres champs
document.getElementById('input-redevable-nom').addEventListener('change', (e) => {
    const option = e.target.options[e.target.selectedIndex];
    if (option.dataset.forme) {
        document.getElementById('input-redevable-forme').value = option.dataset.forme;
        document.getElementById('input-redevable-rep').value = option.dataset.rep || '';
        document.getElementById('input-redevable-adresse').value = option.dataset.adresse || '';
        
        // Mettre à jour l'état
        state.redevableNom = option.value;
        state.redevableForme = option.dataset.forme;
        state.redevableRep = option.dataset.rep || '';
        state.redevableAdresse = option.dataset.adresse || '';
        
        // Mettre à jour l'aperçu immédiatement
        actualiserApercu();
    }
});

// Charger les données au démarrage
window.addEventListener('load', chargerClientsEtConfig);



