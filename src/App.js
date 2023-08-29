import './App.css';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import ToggleButton from 'react-bootstrap/ToggleButton';
import { TableVirtuoso } from "react-virtuoso";
import ClipLoader from "react-spinners/ClipLoader";
import 'bootstrap/dist/css/bootstrap.min.css';
import { useState, useEffect } from "react"
import * as gesel from "gesel";
import UDimPlot from './uDimPlot';

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

function createIgnoreList() {
    let ignored = retrieveFromURL("ignore");
    let output = new Set;
    if (ignored !== "") {
        for (const x of ignored.split(",")) {
            output.add(Number(x));
        }
    }
    return output;
}

const proxy = "https://cors-proxy.aaron-lun.workers.dev";
const ref_url = gesel.referenceBaseUrl();
const ref_key = ref_url.substr(ref_url.lastIndexOf("/") + 1);
const gene_url = gesel.geneBaseUrl();
const gene_key = gene_url.substr(gene_url.lastIndexOf("/") + 1);

gesel.setReferenceDownload(async (file, start, end) => {
    let address = proxy + "/" + encodeURIComponent(ref_url + "/" + file);
    if (start == null || end == null) {
        let cache = await caches.open(ref_key);
        let existing = await cache.match(address);
        if (typeof existing == "undefined") {
            existing = await fetch(address); 
            cache.put(address, existing.clone());
        }
        return existing;
    } else {
        return fetch(address + "?start=" + String(start) + "&end=" + String(end));
    }
});

gesel.setGeneDownload(async file => {
    let address = proxy + "/" + encodeURIComponent(gene_url + "/" + file);
    let cache = await caches.open(gene_key);
    let existing = await cache.match(address);
    if (typeof existing == "undefined") {
        existing = await fetch(address); 
        cache.put(address, existing.clone());
    }
    return existing;
});

const taxonomy2ensembl = {
    "9606": "Homo_sapiens",
    "10090": "Mus_musculus",
    "10116": "Rattus_norvegicus",
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

    const [ collections, setCollections ] = useState(null);

    const [ inactiveCollections, setInactiveCollections ] = useState(createIgnoreList());

    const [ results, setResults ] = useState([]);

    const [ resultsById, setResultsById ] = useState([]);

    const [ members, setMembers ] = useState([]);

    const [ selected, setSelected ] = useState(null);

    const [ hovering, setHovering ] = useState(null);

    const [ hoveringGene, setHoveringGene ] = useState(null);

    const [ loadingSets, setLoadingSets ] = useState(false);

    const [ loadingGenes, setLoadingGenes ] = useState(false);

    const [showDimPlot, setShowDimPlot] = useState(false);

    const [ tsne, setTsne ] = useState(null);

    const [ allSets, setAllSets ] = useState(null);

    const [hoverID, setHoverID] = useState(null);

    const [clickID, setClickID] = useState(null);


    function wipeOnSpeciesChange() {
        // console.log("am i getting called?")
        setResults([]);
        setAllSets(null);
        setHoverID(null);
        setClickID(null);
        setTsne(null);
        setChosenGenes(null);
        setCollections(null);
        setInactiveCollections(new Set);
        setMembers([]);
        setSelected(null);
        setHovering(null);
    }

    function setCollections2(species) {
        gesel.fetchAllCollections(species).then(res => { 
            setCollections(res);
        });
    }

    async function getEmbeddings(species) {
        setLoadingSets(true);
        let embeds = await gesel.fetchEmbeddingsForSpecies(species);


        if (embeds && "x" in embeds && "y" in embeds) {
            setTsne(embeds);
            setLoadingSets(false);
        }
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
            let ngenes = await gesel.effectiveNumberOfGenes(species);
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
                x.collection = deets[x.id].collection;
            });
        }

        if (inactiveCollections.size > 0) {
            let replacement = [];
            for (const r of res) {
                if (!inactiveCollections.has(r.collection)) {
                    replacement.push(r);
                }
            }
            res = replacement;
        }

        setResults(res);

        let res_by_id = {};
        for (var i = 0; i < res.length; i++) {
            res_by_id[res[i].id] = i;
        }
        setResultsById(res_by_id);

        // Assembling a URL link.
        var query_params = [ "species=" + species ];
        if (searchGenes !== "") {
            query_params.push("genes=" + encodeURIComponent(cleaned));
        }
        if (searchText !== "") {
            query_params.push("text=" + encodeURIComponent(searchText));
        }
        if (inactiveCollections.size > 0) {
            query_params.push("ignore=" + Array.from(inactiveCollections).join(","));
        }
        window.history.pushState("search results", "", "?" + query_params.join("&"));

        setLoadingSets(false);
        return true;
    }

    async function fetchSets(species) {
        const all_sets = await gesel.fetchAllSets(species);
        setAllSets(all_sets);
    }

    // Run once during the rendering.
    useEffect(() => {
        if (initial_search) {
            initial_search = false;
            searchSets(null);

            getEmbeddings(species);

            fetchSets(species);
        }

        // console.log(species);
        // setCollections2(species);
    }, []);

    // define a useeffect when species changes
    useEffect(() => {
        if (species) {
            setCollections2(species);
            getEmbeddings(species)
            fetchSets(species);
        }
    }, [species]);

    useEffect(() => {
        if (clickID !== null) {
            focusSet(clickID, species);
        }
    }, [clickID]);

    function focusSet(id, species) {
        setClickID(id);
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

    function unsetHoveringGene(id) {
        if (id == hoveringGene) {
            setHoveringGene(null);
        }
    }

    function formatName(text) {
        if (text.match("^GO:[0-9]+$"))  {
            return <a href={"http://amigo.geneontology.org/amigo/term/" + text} target="_blank">{text}</a> ;
        }
         
        return text;
    }

    function formatDescription(text) {
        if (text.match("^http[^ ]+$")) {
            return <a href={text} target="_blank">link to description</a>;
        }

        return text;
    }

    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: "250px auto 350px",
            gap: "5px",
            height: "100vh",
            padding: "3px",
        }}>
            <div style={{ 
                borderRight: "solid gainsboro 0.5px",
                gridColumn: 1,
                gridRow: 1,
                padding: "10px",
            }}>
                <Form style={{display:"flex", flexDirection: "column", maxHeight: "calc(100vh - 25px)"}}>
                    <Form.Group className="mb-3" controlId="genesFilter">
                        <Form.Label>Filter by genes</Form.Label>
                        <p className="text-muted">
                            Enter a list of genes (Ensembl or Entrez IDs or symbols, one per line, text after <code>#</code> is ignored) and we'll find sets with overlaps.
                            Sets are ranked by the enrichment p-value.
                        </p>
                        <Form.Control 
                            as="textarea"
                            placeholder="SNAP25&#10;Neurod6&#10;ATOH1&#10;ENSG00000142208"
                            value={searchGenes}
                            rows={5}
                            onChange={e => setSearchGenes(e.target.value)}
                            style={{whiteSpace: "pre"}}
                        />
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
                            <option value="10116">Rat</option>
                            <option value="6239">C. elegans</option>
                            <option value="7955">Zebrafish</option>
                            <option value="9598">Chimpanzee</option>
                        </Form.Select>
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="collectionFilter">
                        <Form.Label>Name or description</Form.Label>
                        <br />
                        <Form.Text className="text-muted">
                            <code>*</code> and <code>?</code> wildcards are supported!
                        </Form.Text>
                        <Form.Control 
                            type="text"
                            placeholder="MAPK"
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                        />
                    </Form.Group>
                    {
                        collections !== null && <Form.Group>
                            <Form.Label>Available collections</Form.Label><br/>
                            <div style={{height: "calc(100vh - 590px)", overflowY: "auto", marginBottom: "5px"}}>
                            {
                                collections.map((x, i) => {
                                    let available = !inactiveCollections.has(i);
                                    return (
                                        <Form.Check
                                            key={i}
                                            style={{fontSize: "small", overflowY:"auto"}}
                                            label={x.title}
                                            checked={available}
                                            onChange={() => {
                                                let replacement = new Set(inactiveCollections);
                                                if (inactiveCollections.has(i)) {
                                                    replacement.delete(i);
                                                } else {
                                                    replacement.add(i);
                                                }
                                                setInactiveCollections(replacement);
                                            }}
                                        />
                                    )
                                })
                            }
                            </div>
                        </Form.Group>
                    }
                    <Form.Group>
                        <Button variant="primary" type="search" onClick={searchSets}>
                            Search 
                        </Button>
                    </Form.Group>
                </Form>
            </div>

            <div style={{ 
                gridColumn: 2,
                gridRow: 1,
                wordBreak: "break-all",
                fontSize: "small"
            }}>
                <>
                <div className='plot-header'>
                    <ButtonGroup className="mb-2 plot-toggle">
                            <ToggleButton
                                type="radio"
                                name="radio"
                                value="Table"
                                checked={showDimPlot == false}
                                onClick={(e) => setShowDimPlot(false)}
                            > Table
                            </ToggleButton>
                            <ToggleButton
                                type="radio"
                                name="radio"
                                value="Embedding"
                                checked={showDimPlot == true}
                                onClick={(e) => setShowDimPlot(true)}
                            > Embedding
                            </ToggleButton>
                        </ButtonGroup>
                        <div className='plot-body'>
                            {showDimPlot ? 
                                <strong>Double click a point for details!</strong>
                                :
                                <strong>Click a row for details!</strong>
                            }
                            {
                                hoverID !== null && 
                                <p>
                                    <span>{formatName(allSets[hoverID]?.name)}</span>: {formatDescription(allSets[hoverID]?.description)}{" "}
                                    ({hoverID in resultsById ? results[resultsById[hoverID]].count : 0}/{allSets[hoverID].size},{" "}
                                    p={hoverID in resultsById ? results[resultsById[hoverID]].pvalue.toExponential(3) : 1})
                                </p>
                            }
                        </div>
                    </div>
                    { showDimPlot == true ?
                        <>
                        {
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
                                <UDimPlot 
                                    className="middle-panel"
                                    data={tsne} meta={results} 
                                    setHoverID={setHoverID} 
                                    setClickID={setClickID}
                                    clickID={clickID}/>}
                                </>
                        : 
                        <>
                            {
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
                                        className="middle-panel"
                                        totalCount={results.length}
                                        fixedHeaderContent={(index, user) => (
                                            <tr>
                                                <th style={{ background: "white", width: "20%" }}>Name</th>
                                                <th style={{ background: "white", width: "50%" }}>Description</th>
                                                <th style={{ background: "white", width: "10%" }}>Size</th>
                                                <th style={{ background: "white", width: "10%" }}>Overlap</th>
                                                <th style={{ background: "white", width: "10%" }}>P-value</th>
                                            </tr>
                                        )}
                                        components={{
                                            Table: (props) => <Table {...props} style={{ borderCollapse: 'separate' }} />
                                        }}
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
                                                            {formatName(x.name)}
                                                        </td>
                                                        <td 
                                                            onMouseEnter={() => setHovering(x.id)} 
                                                            onMouseLeave={() => unsetHovering(x.id)} 
                                                            onClick={() => focusSet(x.id, species)} 
                                                            style={{"wordWrap": "break-word", "backgroundColor": defineBackground(x.id)}}
                                                        >
                                                            {formatDescription(x.description)}
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
                            }
                        </>
                    }
                </>
            </div>

            <div style={{
                display: "flex",
                borderLeft: "solid gainsboro 0.5px",
                flexDirection: "column",
                padding: "10px"
            }}>
                <div style={{
                    wordBreak: "break-all",
                    fontSize: "small"
                }}>
                    <h4>Set details</h4>
                    <hr />
                    <table>
                        <colgroup>
                            <col style={{width: "90px"}} />
                            <col style={{width: "calc(100% - 90px)"}} />
                        </colgroup>
                        <tr>
                            <td><strong>Collection:</strong></td>
                            <td>{selected === null ?  "n/a" : selected.collection}</td>
                        </tr>
                        <tr>
                            <td><strong>Name:</strong></td>
                            <td>{selected === null ? "n/a" : selected.name}</td>
                        </tr>
                        <tr>
                            <td><strong>Description:</strong></td>
                            <td>{selected === null ? "n/a" : selected.description}</td>
                        </tr>
                        <tr>
                            <td><strong>Size:</strong></td>
                            <td>{selected === null ? "n/a" : selected.size}</td>
                        </tr>
                    </table>
                    <hr/>
                </div>
                <div style={{
                    overflowY: "auto",
                    wordBreak: "break-all",
                    fontSize: "small"
                }}>
                    {
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
                                style={{fontSize: "small", height: "calc(100vh - 350px)"}}
                                components={{
                                    Table: (props) => <Table {...props} style={{ borderCollapse: 'separate' }} />
                                }}
                                fixedHeaderContent={() => {
                                    return (
                                        <tr>
                                            <th style={{ backgroundColor: "white"}}>Ensembl</th>
                                            <th style={{ backgroundColor: "white", width:"70px"}}>Entrez</th>
                                            <th style={{ backgroundColor: "white", width:"70px"}}>Symbol</th>
                                        </tr>
                                    );
                                }}
                                totalCount={members.length}
                                itemContent={ (i) => 
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
                        }
                    </div>
            </div>
        </div>
    );
}

export default App;
