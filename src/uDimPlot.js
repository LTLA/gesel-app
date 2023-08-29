import { useEffect, useRef, useState } from "react";
import ScatterGL from "epiviz.scatter.gl";
import Rainbow from "./rainbow";

const UDimPlot = (props) => {
  const container = useRef();
  const tooltip = useRef();
  let data = props?.data; // must contain x and y coordinates
  let meta = props?.meta; // if they performed a search
  const [scatterplot, setScatterplot] = useState(null);
  const [mapMeta, setMapMeta] = useState(null);

  useEffect(() => {
    const containerEl = container.current;
    const tooltipEl = tooltip.current;
    if (containerEl && props?.data) {
      let tmp_scatterplot = scatterplot;
      // only create the plot object once
      if (!tmp_scatterplot) {
        containerEl.firstChild &&
          containerEl.removeChild(containerEl.firstChild);

        tmp_scatterplot = new ScatterGL(containerEl);
        setScatterplot(tmp_scatterplot);

        tmp_scatterplot.setInteraction("pan");

        tmp_scatterplot.hoverCallback = function (point_idx) {
          if (point_idx) {
            //   use some threshold (1.5)
            if (point_idx.distance <= 0.02) {
  
              if (map_meta) {
                props?.setHoverID(point_idx.indices[0]);
              }
            } else {
                props?.setHoverID(null);
            }
          } 
        };
  
        tmp_scatterplot.clickCallback = function(point_idx) {
          props?.setClickID(point_idx.indices[0]);
        }
      }

      tmp_scatterplot.setInput({
        x: data.x,
        y: data.y,
      });

      let color = [];
      let size = 1;
      let map_meta= {}

      if (meta && Array.isArray(meta) && meta.length > 0) {
        meta.forEach((x) => (map_meta[x.id] = x));
        setMapMeta(map_meta);

        let counts_vector = meta.map((x) => x.count*100/x.size);
        let tmpgradient = new Rainbow();
        tmpgradient.setSpectrum("#F5F8FA", "#2965CC");
        tmpgradient.setNumberRange(Math.min(...counts_vector), Math.max(...counts_vector));

        size = [];
        color = [];

        for (let i = 0; i < data.x.length; i++) {

          if (i in map_meta) {
            if (props?.clickID == i) {
              color.push("#FF0000");
            } else {
              color.push("#" + tmpgradient.colorAt(map_meta[i].count*100/map_meta[i].size));
            }
            size.push(5);
          } else {
            if (props?.clickID == i) {
              color.push("#FF0000");
            } else {
              color.push("#" + tmpgradient.colorAt(0));
            }
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
            size: size,
          });
        }
      } else {
        tmp_scatterplot.setState({
          size: size,
        });
      }

      tmp_scatterplot.render();
    }
  }, [props?.data, props?.meta, props?.clickID]);

  useEffect(() => {
    return () => {
      scatterplot?.plot.dataWorker.terminate();
      scatterplot?.plot.webglWorker.terminate();
    };
  }, [scatterplot]);

  return (
    <>
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
    <div>
        Double click on the dots bruh.
    </div>
    </>
  );
};

export default UDimPlot;
