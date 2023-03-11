import logo from './logo.svg';
import './App.css';
import Container from "react-bootstrap/Container"
import Row from "react-bootstrap/Row"
import Col from "react-bootstrap/Col"
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';
import { TableVirtuoso } from 'react-virtuoso'
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

var initial_state = { 
    "genes": retrieveFromURL("genes"),
    "species": retrieveFromURL("species") || "9606",
    "text": retrieveFromURL("text"),
};

function App() {
    const [ filters, setFilters ] = useState(initial_state);

    // Everything below needs to be wiped when the species changes.
    const [ chosenGenes, setChosenGenes ] = useState(null);

    const [ results, setResults ] = useState([]);

    const [ members, setMembers ] = useState([]);

    const [ selected, setSelected ] = useState(null);

    const [ hovering, setHovering ] = useState(null);

    function copyAndSet(field) {
        return (event) => {
            var tmp = { ...filters };
            tmp[field] = event.target.value;
            setFilters(tmp);
        };
    }

    async function searchSets(e) {
        if (e !== null) {
            e.preventDefault();
        }

        var cleaned = "";
        var genes = null;

        if (filters.genes !== "") {
            var lines = filters.genes.split("\n");
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
                var gene_info = await gesel.searchGenes(filters.species, queries);
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

                var copy = { ...filters, genes: updated };
                setFilters(copy);
            }
        }

        let res = null;
        if (genes === null) {
            setChosenGenes(null);
        } else {
            let uniqued = new Set(genes);
            setChosenGenes(uniqued);
            genes = Array.from(uniqued);
            res = await gesel.findOverlappingSets(filters.species, genes, { includeSize: true });
            let ngenes = (await gesel.fetchAllGenes(filters.species)).get("ensembl").length;
            res.forEach(x => { 
                x.pvalue = gesel.testEnrichment(x.count, genes.length, x.size, ngenes); 
            });
            res.sort((left, right) => left.pvalue - right.pvalue);
        }

        if (filters.text.match(/[\w]+/)) {
            let desc_matches = await gesel.searchSetText(filters.species, filters.text);
            if (res == null) {
                let sizes = await gesel.fetchSetSizes(filters.species);
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
            let deets = await gesel.fetchAllSets(filters.species);
            res.forEach(x => {
                x.name = deets[x.id].name;
                x.description = deets[x.id].description;
            });
        }
        setResults(res);

        // Assembling a URL link.
        var query_params = [];
        for (const [key, val] of Object.entries(filters)) {
            if (val !== "") {
                let val_ = (key === "genes" ? cleaned : val);
                query_params.push(key + "=" + encodeURIComponent(val_));
            }
        }

        if (query_params.length) {
            window.history.pushState("search results", "", "?" + query_params.join("&"));
        }

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
                    console.log(i);
                    let is_in = (chosenGenes === null || !chosenGenes.has(x.id));
                    return (
                        <>
                            <td style={is_in ? {} : {"font-weight": "bold"}}>{x.ensembl.join(", ")}</td>
                            <td style={is_in ? {} : {"font-weight": "bold"}}>{x.entrez.join(", ")}</td>
                            <td style={is_in ? {} : {color: "red", "font-weight": "bold"}}>{x.symbol.join(", ")}</td>
                        </>
                    );
                }
            }
        />
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
                    value={filters["genes"]}
                    rows={10}
                    onChange={copyAndSet("genes")}
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
                    value={filters["species"]}
                    onChange={copyAndSet("species")}
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
                    value={filters["text"]}
                    onChange={copyAndSet("text")}
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
                                onClick={() => focusSet(x.id, filters.species)} 
                                style={{"wordWrap": "break-word", "backgroundColor": defineBackground(x.id)}}
                            >
                                {x.name}
                            </td>
                            <td 
                                onMouseEnter={() => setHovering(x.id)} 
                                onMouseLeave={() => unsetHovering(x.id)} 
                                onClick={() => focusSet(x.id, filters.species)} 
                                style={{"wordWrap": "break-word", "backgroundColor": defineBackground(x.id)}}
                            >
                                {x.description}
                            </td>
                            <td 
                                onMouseEnter={() => setHovering(x.id)} 
                                onMouseLeave={() => unsetHovering(x.id)} 
                                onClick={() => focusSet(x.id, filters.species)} 
                                style={{"backgroundColor": defineBackground(x.id)}}
                            >
                                {x.size}
                            </td>
                            <td
                                onMouseEnter={() => setHovering(x.id)} 
                                onMouseLeave={() => unsetHovering(x.id)} 
                                onClick={() => focusSet(x.id, filters.species)} 
                                style={{"backgroundColor": defineBackground(x.id)}}
                            >
                                {"count" in x ? x.count : "n/a"}
                            </td>
                            <td 
                                onMouseEnter={() => setHovering(x.id)} 
                                onMouseLeave={() => unsetHovering(x.id)} 
                                onClick={() => focusSet(x.id, filters.species)} 
                                style={{"backgroundColor": defineBackground(x.id)}}
                            >
                                {"pvalue" in x ? x.pvalue.toExponential(3) : "n/a"}
                            </td>
                        </>
                    );
                }
            }
        />
    </div>
    </div>
    );
}

export default App;
