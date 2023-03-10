import logo from './logo.svg';
import './App.css';
import Container from "react-bootstrap/Container"
import Row from "react-bootstrap/Row"
import Col from "react-bootstrap/Col"
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';
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

    const [ results, setResults ] = useState([]);

    const [ leftovers, setLeftovers ] = useState(0);

    const [ chosenGenes, setChosenGenes ] = useState(null);

    const [ members, setMembers ] = useState([]);

    const [ selected, setSelected ] = useState(null);

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
            setChosenGenes(new Set(genes));
            res = await gesel.findOverlappingSets(filters.species, genes, { includeSize: true });

            // Sorting by the overlap percentage, unless the count is 1, in
            // which case we push that set to the back.
            res.forEach(x => {
                x._sorter = x.count / x.size;
                if (x.count === 1) {
                    x._sorter /= 1e8;
                }
            });
            res.sort((left, right) => right._sorter - left._sorter);
            res.forEach(x => delete x._sorter);
        }

        if (filters.text.match(/[\w]+/)) {
            let desc_matches = await gesel.searchSetText(filters.species, filters.text);
            if (res == null) {
                // TODO: expose fetchSetSizes() for use here.
                res = [];
                for (const i of desc_matches) {
                    res.push({ id: i });
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

        // TODO: replace this section with a virtual table that calls fetchSingleSet().
        if (res !== null) {
            if (res.length > 100) {
                setLeftovers(res.length - 100);
                res = res.slice(0, 100); // truncating for readability.
            } else {
                setLeftovers(0);
            }
            let deets = await gesel.fetchAllSets(filters.species);
            res.forEach(x => {
                x.name = deets[x.id].name;
                x.description = deets[x.id].description;
            });
        } else {
            res = [];
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

    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: "80% 19%",
            gap: "5px",
            height: '100vh',
            gridTemplateRows: "100vh"
        }}>
        <div style={{
            overflow: "auto",
            borderLeft: "solid grey 0.5px",
            gridColumn: 2,
            padding: "10px",
            gridRow: 1,
            wordWrap: "break-word"
        }}>
        <h3>Set details</h3>
        <strong>Collection:</strong> {selected === null ?  "n/a" : selected.collection}<br/>
        <strong>Name:</strong> {selected === null ? "n/a" : selected.name}<br/>
        <strong>Description:</strong> {selected === null ? "n/a" : selected.description}<br/>
        <strong>Size:</strong> {selected === null ? "n/a" : selected.size}
        <hr/>
        <Table striped bordered style={{tableLayout: "fixed", width: "100%"}}>
            <thead>
                <tr>
                    <th style={{ wordWrap: "break-word", width: "33%" }}>Ensembl</th>
                    <th style={{ wordWrap: "break-word", width: "33%" }}>Entrez</th>
                    <th style={{ wordWrap: "break-word", width: "33%" }}>Symbol</th>
                </tr>
            </thead>
            <tbody>
                {
                    selected === null ? "" :
                    members.map(x => {
                        let is_in = (chosenGenes === null || !chosenGenes.has(x.id));
                        return (
                            <tr>
                                <td style={is_in ? {} : {"font-weight": "bold"}}>{x.ensembl.join(", ")}</td>
                                <td style={is_in ? {} : {"font-weight": "bold"}}>{x.entrez.join(", ")}</td>
                                <td style={is_in ? {} : {color: "red", "font-weight": "bold"}}>{x.symbol.join(", ")}</td>
                            </tr>
                        );
                    })
                }
            </tbody>
        </Table>
        </div>
        <div style={{ 
            overflow: "auto",
            gridColumn: 1,
            padding: "5px",
            gridRow: 1
        }}>
        <Container>
            <Row>
                <Col>
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
                            Sets are ranked by their percentage overlap with this list.
                            </Form.Text>
                        </Form.Group>
                    </Form>
                </Col>
                <Col>
                    <Form>
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
                </Col>
            </Row>
            <hr/>
            <Table striped bordered hover responsive style={{tableLayout: "fixed", width: "100%"}}>
                <thead>
                    <tr>
                        <th style={{ width: "32%" }}>Name</th>
                        <th style={{ width: "40%" }}>Description</th>
                        <th style={{ width: "6%" }}>Size</th>
                        <th style={{ width: "7%" }}>Overlap</th>
                    </tr>
                </thead>
                <tbody>
                {
                    results.map(x => {
                        return (
                            <tr onClick={() => { 
                                gesel.fetchSingleSet(filters.species, x.id).then(async res => { 
                                    let current_collection = await gesel.fetchSingleCollection(filters.species, res.collection);
                                    setSelected({
                                        name: res.name,
                                        description: res.description,
                                        size: res.size,
                                        collection: current_collection.title
                                    }); 
                                });
                                gesel.fetchGenesForSet(filters.species, x.id).then(async res => {
                                    let everything = await gesel.fetchAllGenes(filters.species);
                                    let ensembl = everything.get("ensembl");
                                    let entrez = everything.get("entrez");
                                    let symbol = everything.get("symbol");

                                    let new_members = [];
                                    for (const i of res) {
                                        new_members.push({ id: i, ensembl: ensembl[i], symbol: symbol[i], entrez: entrez[i] });
                                    }
                                    setMembers(new_members);
                                })
                            }}>
                                <td style={{"wordWrap": "break-word"}}>{x.name}</td>
                                <td style={{"wordWrap": "break-word"}}>{x.description}</td>
                                <td>{x.size}</td>
                                <td>{"count" in x ? x.count : "n/a"}</td>
                            </tr>
                        );
                    })
                }
            </tbody>
            </Table>
            {
                leftovers > 0 ? 
                    (<p>... and {leftovers} more sets</p>) :
                    ""
            }
        </Container>
        </div>
        </div>
    );
}

export default App;
