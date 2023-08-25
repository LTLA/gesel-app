import { useEffect, useRef, useState } from "react";
import ScatterGL from "epiviz.scatter.gl";
import Rainbow from "./rainbow";

const UDimPlot = (props) => {
  const container = useRef();
  let data = props?.data; // must contain x and y coordinates
  let meta = props?.meta; // if they performed a search
  const [scatterplot, setScatterplot] = useState(null);

  useEffect(() => {
    const containerEl = container.current;
    if (containerEl && props?.data) {
      let tmp_scatterplot = scatterplot;
      // only create the plot object once
      if (!tmp_scatterplot) {
        
        containerEl.firstChild &&
          containerEl.removeChild(containerEl.firstChild);

        tmp_scatterplot = new ScatterGL(containerEl);
        setScatterplot(tmp_scatterplot);

        tmp_scatterplot.setInteraction("pan");
        // tmp_scatterplot.selectionCallback = function (points) {
        //   points?.selection?.indices.length > 0 &&
        //     props?.setSelectedPoints(points?.selection?.indices);
        // };

        tmp_scatterplot.clickCallback = function(point_idx) {
            console.log(point_idx)
        }

        tmp_scatterplot.hoverCallback = function (point_idx) {
            if (point_idx) {
              //   use some threshold (1.5)
              if (point_idx.distance <= 1.5) {

                console.log(point_idx)
              }
            }
          };
      }

      tmp_scatterplot.setInput({
        x: data.x,
        y: data.y,
      });

      let color = [];
      let size = 2;

      if (meta && Array.isArray(meta) && meta.length > 0) {
        let map_meta = {}
        meta.forEach(x => map_meta[x.id] = x);

        let counts_vector = meta.map(x => x.count);
        let tmpgradient = new Rainbow();
        tmpgradient.setSpectrum("#F5F8FA", "#2965CC");
        tmpgradient.setNumberRange(0, Math.max(...counts_vector));

        size = []
        color = []

        for (let i = 0; i < data.x.length; i++) {
          if (i in map_meta) {
            color.push("#" + tmpgradient.colorAt(map_meta[i].count));
            size.push(3);
          } else {
            color.push("#" + tmpgradient.colorAt(0));
            size.push(1);
          }
        }
      }

      // fall back
      if (color.length == 0) {
        color = props?.colors;
      }

      if (color && Array.isArray(color)) {
        if (color.length != data.x.length) {
          console.error("length of colors does not match the number of dots.");
        } else {
          tmp_scatterplot.setState({
            color: color,
            size: 2,
          });
        }
      } else {
        tmp_scatterplot.setState({
          size: 2,
        });
      }

      tmp_scatterplot.render();
    }
  }, [props]);

  useEffect(() => {
    return () => {
      scatterplot?.plot.dataWorker.terminate();
      scatterplot?.plot.webglWorker.terminate();
    };
  }, [scatterplot]);

  return (
    <div className="udimplot-container">
      <div className="dim-plot">
        <div
          ref={container}
          style={{
            width: "100%",
            height: "100%",
          }}
        ></div>
      </div>
    </div>
  );
};

export default UDimPlot;