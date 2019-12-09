import deepEqual from 'fast-deep-equal';
import { geoScaleToZoom } from '../geo';
import { osmEntity } from '../osm';
import { svgPointTransform } from './helpers';
import { svgTagClasses } from './tag_classes';

export function svgPoints(projection, context) {

    function markerPath(selection, klass) {
        selection
            .attr('class', klass)
            .attr('transform', 'translate(-9, -24)')
            .attr('d', 'M6,17.75 C4,16.9 0.5,14.47 0.5,9.5 C0.5,4.53 4.53,0.5 9.5,0.5 C14.47,0.5 18.5,4.53 18.5,9.5 C18.5,14.47 15,16.9 13,17.75 C11.6667,18.3167 10.5,20.2333 9.5,23.5 C8.5,20.2333 7.3333,18.3167 6,17.75 Z');
    }

    function sortY(a, b) {
        return b.loc[1] - a.loc[1];
    }


    // Avoid exit/enter if we're just moving stuff around.
    // The node will get a new version but we only need to run the update selection.
    function fastEntityKey(d) {
        var mode = context.mode();
        var isMoving = mode && /^(add|draw|drag|move|rotate)/.test(mode.id);
        return isMoving ? d.id : osmEntity.key(d);
    }


    function drawTargets(selection, graph, entities, filter) {
        var fillClass = context.getDebug('target') ? 'pink ' : 'nocolor ';
        var getTransform = svgPointTransform(projection).geojson;
        var activeID = context.activeID();
        var data = [];

        entities.forEach(function(node) {
            if (activeID === node.id) return;   // draw no target on the activeID

            data.push({
                type: 'Feature',
                id: node.id,
                properties: {
                    target: true,
                    entity: node
                },
                geometry: node.asGeoJSON()
            });
        });

        var targets = selection.selectAll('.point.target')
            .filter(function(d) { return filter(d.properties.entity); })
            .data(data, function key(d) { return d.id; });

        // exit
        targets.exit()
            .remove();

        // enter/update
        targets.enter()
            .append('rect')
            .attr('x', -10)
            .attr('y', -26)
            .attr('width', 20)
            .attr('height', 30)
            .merge(targets)
            .attr('class', function(d) { return 'node point target ' + fillClass + d.id; })
            .attr('transform', getTransform);
    }


    function drawPoints(selection, graph, entities, filter) {
        var wireframe = context.surface().classed('fill-wireframe');
        var zoom = geoScaleToZoom(projection.scale());
        var base = context.history().base();

        // Points with a direction will render as vertices at higher zooms..
        function renderAsPoint(entity) {
            return entity.geometry(graph) === 'point' &&
                !(zoom >= 18 && entity.directions(graph, projection).length);
        }

        // All points will render as vertices in wireframe mode too..
        var points = wireframe ? [] : entities.filter(renderAsPoint);
        points.sort(sortY);


        var drawLayer = selection.selectAll('.layer-osm.points .points-group.points');
        var touchLayer = selection.selectAll('.layer-touch.points');

        // Draw points..
        var groups = drawLayer.selectAll('g.point')
            .filter(filter)
            .data(points, fastEntityKey);

        groups.exit()
            .remove();

        var enter = groups.enter()
            .append('g')
            .attr('class', function(d) { return 'node point ' + d.id; })
            .order();

        enter
            .append('path')
            .call(markerPath, 'shadow');

        enter
            .append('ellipse')
            .attr('cx', 0.5)
            .attr('cy', 1)
            .attr('rx', 6.5)
            .attr('ry', 3)
            .attr('class', 'stroke');

        enter
            .append('path')
            .call(markerPath, 'stroke');

        enter
            .append('use')
            .attr('transform', 'translate(-5.5, -20.5)')
            .attr('class', 'icon')
            .attr('width', '12px')
            .attr('height', '12px');

        groups = groups
            .merge(enter)
            .attr('transform', svgPointTransform(projection))
            .classed('added', function(d) {
                return !base.entities[d.id]; // if it doesn't exist in the base graph, it's new
            })
            .classed('moved', function(d) {
                return base.entities[d.id] && !deepEqual(graph.entities[d.id].loc, base.entities[d.id].loc);
            })
            .classed('retagged', function(d) {
                return base.entities[d.id] && !deepEqual(graph.entities[d.id].tags, base.entities[d.id].tags);
            })
            .call(svgTagClasses());

        groups.select('.shadow');   // propagate bound data
        groups.select('.stroke');   // propagate bound data
        groups.select('.icon')      // propagate bound data
            .attr('xlink:href', function(entity) {
                var preset = context.presets().match(entity, graph);
                var picon = preset && preset.icon;

                if (!picon) {
                    return '';
                } else {
                    var isMaki = /^maki-/.test(picon);
                    return '#' + picon + (isMaki ? '-11' : '');
                }
            });


        // Draw touch targets..
        touchLayer
            .call(drawTargets, graph, points, filter);
    }


    return drawPoints;
}
