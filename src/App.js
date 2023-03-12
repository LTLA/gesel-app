import logo from './logo.svg';
import './App.css';
import Container from "react-bootstrap/Container"
import Row from "react-bootstrap/Row"
import Col from "react-bootstrap/Col"
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';
import { TableVirtuoso } from 'react-virtuoso'
import ClipLoader from "react-spinners/ClipLoader";
import 'bootstrap/dist/css/bootstrap.min.css';
import { useState, useEffect } from "react"
import * as gesel from "gesel";

// Seeing if we need to do anything.
const params = new URLSearchParams(window.location.search);
var initial_search = false;
function retrieveFromURL(key) {
    var val = params.get(key);
    if (val === null) {
        return "";
    } else {
        initial_search = true;
        return decodeURIComponent(val);
    }
}

const proxy = "https://cors-proxy.aaron-lun.workers.dev";

gesel.setReferenceDownload((file, start, end) => {
    let address = proxy + "/" + encodeURIComponent(gesel.referenceBaseUrl() + "/" + file);
    if (start == null || end == null) {
        return fetch(address); // TODO: add caching.
    } else {
        return fetch(address + "?start=" + String(start) + "&end=" + String(end));
    }
});

gesel.setGeneDownload(file => {
    let address = proxy + "/" + encodeURIComponent(gesel.geneBaseUrl() + "/" + file);
    return fetch(address); // TODO: add caching.
});

const taxonomy2ensembl = {
    "9606": "Homo_sapiens",
    "10090": "Mus_musculus",
    "7227": "Drosophila_melanogaster",
    "6239": "Caenorhabditis_elegans",
    "7955": "Danio_rerio",
    "9598": "Pan_troglodytes"
};

function App() {
    const [ species, setSpecies ] = useState(retrieveFromURL("species") || "9606");

    const [ searchText, setSearchText ] = useState(retrieveFromURL("text"));

    const [ searchGenes, setSearchGenes ] = useState(retrieveFromURL("genes"));

    const [ chosenGenes, setChosenGenes ] = useState(null);

    const [ results, setResults ] = useState([]);

    const [ members, setMembers ] = useState([]);

    const [ selected, setSelected ] = useState(null);

    const [ hovering, setHovering ] = useState(null);

    const [ hoveringGene, setHoveringGene ] = useState(null);

    const [ loadingSets, setLoadingSets ] = useState(false);

    const [ loadingGenes, setLoadingGenes ] = useState(false);

    function wipeOnSpeciesChange() {
        setChosenGenes(null);
        setResults([]);
        setMembers([]);
        setSelected(null);
        setHovering(null);
    }

    async function searchSets(e) {
        setLoadingSets(true);
        setResults([]);
        if (e !== null) {
            e.preventDefault();
        }

        var cleaned = "";
        var genes = null;

        if (searchGenes !== "") {
            var lines = searchGenes.split("\n");
            let queries = [];
            let nonempty = false;
            for (let i = 0; i < lines.length; i++) {
                var x = lines[i];
                x = x.replace(/#.*/, "");
                x = x.trim();
                if (x !== "") {
                    queries.push(x);
                    nonempty = true;
                }
            }

            if (nonempty) {
                var gene_info = await gesel.searchGenes(species, queries);
                genes = [];
                var updated = "";

                for (let i = 0; i < gene_info.length; i++) {
                    let x = gene_info[i];
                    for (const y of x) {
                        genes.push(y);
                    }

                    updated += queries[i];
                    if (x.length === 0) {
                        updated += " # ❌ no matching gene found";
                    }
                    updated += "\n";

                    cleaned += queries[i] + "\n";
                }

                setSearchGenes(updated);
            }
        }

        let res = null;
        if (genes === null) {
            setChosenGenes(null);
        } else {
            let uniqued = new Set(genes);
            setChosenGenes(uniqued);
            genes = Array.from(uniqued);
            res = await gesel.findOverlappingSets(species, genes, { includeSize: true });
            let ngenes = (await gesel.fetchAllGenes(species)).get("ensembl").length;
            res.forEach(x => { 
                x.pvalue = gesel.testEnrichment(x.count, genes.length, x.size, ngenes); 
            });
            res.sort((left, right) => left.pvalue - right.pvalue);
        }

        if (searchText.match(/[\w]+/)) {
            let desc_matches = await gesel.searchSetText(species, searchText);
            if (res == null) {
                let sizes = await gesel.fetchSetSizes(species);
                res = [];
                for (const i of desc_matches) {
                    res.push({ id: i, size: sizes[i] });
                }
            } else {
                let replacement = [];
                let allowed = new Set(desc_matches);
                for (const x of res) {
                    if (allowed.has(x.id)) {
                        replacement.push(x);
                    }
                }
                res = replacement;
            }
        }

        if (res === null) {
            res = [];
        } else {
            let deets = await gesel.fetchAllSets(species);
            res.forEach(x => {
                x.name = deets[x.id].name;
                x.description = deets[x.id].description;
            });
        }
        setResults(res);

        // Assembling a URL link.
        var query_params = [ "species=" + species ];
        if (searchGenes !== "") {
            query_params.push("genes=" + encodeURIComponent(cleaned));
        }
        if (searchText !== "") {
            query_params.push("genes=" + encodeURIComponent(searchText));
        }
        window.history.pushState("search results", "", "?" + query_params.join("&"));

        setLoadingSets(false);
        return true;
    }

    // Run once during the rendering.
    useEffect(() => {
        if (initial_search) {
            initial_search = false;
            searchSets(null);
        }
    }, []);

    function focusSet(id, species) {
        setLoadingGenes(true);
        gesel.fetchSingleSet(species, id).then(async res => { 
            let current_collection = await gesel.fetchSingleCollection(species, res.collection);
            setSelected({
                id: id,
                name: res.name,
                description: res.description,
                size: res.size,
                collection: current_collection.title
            }); 
        });
        gesel.fetchGenesForSet(species, id).then(async res => {
            let everything = await gesel.fetchAllGenes(species);
            let ensembl = everything.get("ensembl");
            let entrez = everything.get("entrez");
            let symbol = everything.get("symbol");

            let new_members = [];
            for (const i of res) {
                new_members.push({ id: i, ensembl: ensembl[i], symbol: symbol[i], entrez: entrez[i] });
            }
            setMembers(new_members);
            setLoadingGenes(false);
        })
    }

    function defineBackground(id) {
        if (selected !== null && id == selected.id) {
            return "#cdc2c0"
        } else if (hovering !== null && id == hovering) {
            return "#add8e6";
        } else {
            return "#00000000";
        }
    }

    function unsetHovering(id) {
        if (id == hovering) {
            setHovering(null);
        }
    }

    function defineBackgroundGene(id) {
    }

    function unsetHoveringGene(id) {
        if (id == hoveringGene) {
            setHoveringGene(null);
        }
    }

    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 0.01fr 2fr 0.01fr 1fr"
        }}>

        <div style={{
            display: "grid",
            borderLeft: "solid grey 0.5px",
            gridTemplateRows: "1fr 5fr",
            gridColumn: 5,
            gridRow: 1
        }}>
        <div style={{
            gridColumn: 1,
            gridRow: 1
        }}>
        <h3>Set details</h3>
        <strong>Collection:</strong> {selected === null ?  "n/a" : selected.collection}<br/>
        <strong>Name:</strong> {selected === null ? "n/a" : selected.name}<br/>
        <strong>Description:</strong> {selected === null ? "n/a" : selected.description}<br/>
        <strong>Size:</strong> {selected === null ? "n/a" : selected.size}
        <hr/>
        </div>
        <div style={{
            overflow: "auto",
            gridColumn: 1,
            gridRow: 2
        }}>
        {(
            loadingGenes ? 
                <div style={{textAlign:"center"}}>
                    <ClipLoader
                      color="#000000"
                      loading={true}
                      size={150}
                      aria-label="Loading Spinner"
                      data-testid="loader"
                    />
                </div>
                :
                <TableVirtuoso
                    totalCount={members.length}
                    fixedHeaderContent={(index, user) => {
                        return (
                            <tr>
                                <th style={{ backgroundColor: "white", wordWrap: "break-word", width: "200px" }}>Ensembl</th>
                                <th style={{ backgroundColor: "white", wordWrap: "break-word", width: "200px" }}>Entrez</th>
                                <th style={{ backgroundColor: "white", wordWrap: "break-word", width: "200px" }}>Symbol</th>
                            </tr>
                        );
                    }}
                    itemContent={i => 
                        {
                            let x = members[i];
                            let style = { "backgroundColor":  (hoveringGene !== null && x.id == hoveringGene ? "#add8e6" : "#00000000") };
                            let combinedStyle = style;
                            let textStyle = {};
                            if (chosenGenes !== null && chosenGenes.has(x.id)) {
                                textStyle = { fontWeight: "bold", color: "red" };
                                combinedStyle = { ...style, ...textStyle } 
                            }

                            let all_entrez = [];
                            for (var i = 0; i < x.entrez.length; i++) {
                                if (i > 0) {
                                    all_entrez.push(", ");
                                }
                                all_entrez.push(<a target="_blank" style={textStyle} href={"https://www.ncbi.nlm.nih.gov/gene/" + x.entrez[i]}>{x.entrez[i]}</a>)
                            }

                            let all_ensembl = [];
                            let ens_species = taxonomy2ensembl[species];
                            for (var i = 0; i < x.ensembl.length; i++) {
                                if (i > 0) {
                                    all_ensembl.push(", ");
                                }
                                all_ensembl.push(<a target="_blank" style={textStyle} href={"https://ensembl.org/" + ens_species + "/Gene/Summary?g=" + x.ensembl[i]}>{x.ensembl[i]}</a>);
                            }

                            return (
                                <>
                                    <td 
                                        onMouseEnter={() => setHoveringGene(x.id)} 
                                        onMouseLeave={() => unsetHoveringGene(x.id)} 
                                        style={style}
                                    >
                                        {all_ensembl}
                                    </td>
                                    <td 
                                        onMouseEnter={() => setHoveringGene(x.id)} 
                                        onMouseLeave={() => unsetHoveringGene(x.id)} 
                                        style={style}
                                    >
                                        {all_entrez}
                                    </td>
                                    <td 
                                        onMouseEnter={() => setHoveringGene(x.id)} 
                                        onMouseLeave={() => unsetHoveringGene(x.id)} 
                                        style={combinedStyle}
                                    >
                                        {x.symbol.join(", ")}
                                    </td>
                                </>
                            );
                        }
                    }
                />
        )}
        </div>
        </div>

        <div style={{ 
            overflow: "auto",
            borderRight: "solid grey 0.5px",
            gridColumn: 1,
            gridRow: 1,
            padding: "5px"
        }}>
        <Form>
            <Form.Group className="mb-3" controlId="genesFilter">
                <Form.Label>Filter by genes</Form.Label>
                <Form.Control 
                    as="textarea"
                    placeholder="SNAP25&#10;Neurod6&#10;ATOH1&#10;ENSG00000142208"
                    value={searchGenes}
                    rows={10}
                    onChange={e => setSearchGenes(e.target.value)}
                    style={{whiteSpace: "pre"}}
                />
                <Form.Text className="text-muted">
                Enter a list of genes (Ensembl or Entrez IDs or symbols, one per line, text after <code>#</code> is ignored) and we'll find sets with overlaps.
                Sets are ranked by the enrichment p-value.
                </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3" controlId="speciesFilter">
                <Form.Label>Filter by species</Form.Label>
                <Form.Select 
                    aria-label="Species" 
                    value={species}
                    onChange={e => {
                        setSpecies(e.target.value);
                        wipeOnSpeciesChange();
                    }}
                >
                    <option value="9606">Human</option>
                    <option value="10090">Mouse</option>
                    <option value="7227">Fly</option>
                    <option value="6239">C. elegans</option>
                    <option value="7955">Zebrafish</option>
                    <option value="9598">Chimpanzee</option>
                </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3" controlId="collectionFilter">
                <Form.Label>Name or description</Form.Label>
                <Form.Control 
                    type="text"
                    placeholder="MAPK"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                />
                <Form.Text className="text-muted">
                <code>*</code> and <code>?</code> wildcards are supported!
                </Form.Text>
            </Form.Group>
            <Form.Group>
                <Form.Label></Form.Label><br/>
                <Button variant="primary" type="search" onClick={searchSets}>
                   Search 
                </Button>
            </Form.Group>
        </Form>
    </div>

    <div style={{ 
        gridColumn: 3,
        gridRow: 1
    }}>
        {(
            loadingSets ? 
                <div style={{textAlign:"center"}}>
                    <ClipLoader
                      color="#000000"
                      loading={true}
                      size={150}
                      aria-label="Loading Spinner"
                      data-testid="loader"
                    />
                </div>
                :
                <TableVirtuoso
                    totalCount={results.length}
                    fixedHeaderContent={(index, user) => (
                        <tr>
                            <th style={{ background: "white", width: "500px" }}>Name</th>
                            <th style={{ background: "white", width: "800px" }}>Description</th>
                            <th style={{ background: "white", width: "100px" }}>Size</th>
                            <th style={{ background: "white", width: "100px" }}>Overlap</th>
                            <th style={{ background: "white", width: "100px" }}>P-value</th>
                        </tr>
                    )}
                    itemContent={i => 
                        {
                            const x = results[i];
                            return (
                                <>
                                    
                                    <td 
                                        onMouseEnter={() => setHovering(x.id)} 
                                        onMouseLeave={() => unsetHovering(x.id)} 
                                        onClick={() => focusSet(x.id, species)} 
                                        style={{"wordWrap": "break-word", "backgroundColor": defineBackground(x.id)}}
                                    >
                                        {x.name}
                                    </td>
                                    <td 
                                        onMouseEnter={() => setHovering(x.id)} 
                                        onMouseLeave={() => unsetHovering(x.id)} 
                                        onClick={() => focusSet(x.id, species)} 
                                        style={{"wordWrap": "break-word", "backgroundColor": defineBackground(x.id)}}
                                    >
                                        {x.description}
                                    </td>
                                    <td 
                                        onMouseEnter={() => setHovering(x.id)} 
                                        onMouseLeave={() => unsetHovering(x.id)} 
                                        onClick={() => focusSet(x.id, species)} 
                                        style={{"backgroundColor": defineBackground(x.id)}}
                                    >
                                        {x.size}
                                    </td>
                                    <td
                                        onMouseEnter={() => setHovering(x.id)} 
                                        onMouseLeave={() => unsetHovering(x.id)} 
                                        onClick={() => focusSet(x.id, species)} 
                                        style={{"backgroundColor": defineBackground(x.id)}}
                                    >
                                        {"count" in x ? x.count : "n/a"}
                                    </td>
                                    <td 
                                        onMouseEnter={() => setHovering(x.id)} 
                                        onMouseLeave={() => unsetHovering(x.id)} 
                                        onClick={() => focusSet(x.id, species)} 
                                        style={{"backgroundColor": defineBackground(x.id)}}
                                    >
                                        {"pvalue" in x ? x.pvalue.toExponential(3) : "n/a"}
                                    </td>
                                </>
                            );
                        }
                    }
                />
        )}
    </div>
    </div>
    );
}

export default App;
