import { useEffect, useRef, useState } from "react";
import ScatterGL from "epiviz.scatter.gl";

const UDimPlot = (props) => {
  const container = useRef();
  let data = props?.data; // must contain x and y coordinates
  let colors = props?.colors; // color vector, must match the number of cells
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
            console.log(`index: ${point_idx} is clicked.`);
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

      // fall back
      if (color.length == 0) {
        color = props?.colors;
      }

      if (color.length != data.x.length) {
        console.error("length of colors does not match the number of dots.");
      } else {
        tmp_scatterplot.setState({
          color: color,
          size: 5,
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