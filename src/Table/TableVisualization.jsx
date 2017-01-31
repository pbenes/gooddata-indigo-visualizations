import React, { Component, PropTypes } from 'react';
import ReactDOM from 'react-dom';
import { Table, Column, Cell } from 'fixed-data-table-2';
import classNames from 'classnames';
import { noop, partial, uniqueId, debounce, pick } from 'lodash';

import 'fixed-data-table-2/dist/fixed-data-table.css';

import Bubble from '@gooddata/goodstrap/lib/Bubble/ReactBubble';
import TableSortBubbleContent from './TableSortBubbleContent';

import '../styles/table.scss';

import {
    getNextSortDir,
    getColumnAlign,
    getStyledLabel,
    getCellClassNames,
    getHeaderClassNames,
    getHeaderSortClassName,
    getTooltipSortAlignPoints,
    calculateArrowPositions
} from './utils';

const MIN_COLUMN_WIDTH = 100;
const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;
export const DEFAULT_ROW_HEIGHT = 30;
export const DEFAULT_HEADER_HEIGHT = 26;

const DEBOUNCE_SCROLL_STOP = 500;

const scrollEvents = ['scroll', 'goodstrap.scrolled', 'goodstrap.drag'];

export default class TableVisualization extends Component {
    static propTypes = {
        containerWidth: PropTypes.number.isRequired,
        containerHeight: PropTypes.number,
        containerMaxHeight: PropTypes.number,
        hasHiddenRows: PropTypes.bool,
        rows: PropTypes.array.isRequired,
        headers: PropTypes.array.isRequired,
        sortInTooltip: PropTypes.bool,
        sortDir: PropTypes.string,
        sortBy: PropTypes.number,
        onSortChange: PropTypes.func,
        stickyHeader: PropTypes.number
    };

    static defaultProps = {
        rows: [],
        headers: [],
        onSortChange: noop,
        sortInTooltip: false,
        stickyHeader: -1
    };

    constructor(props) {
        super(props);
        this.state = {
            hintSortBy: null,
            sortBubble: {
                visible: false
            },
            width: 0,
            height: 0
        };

        this.renderTooltipHeader = this.renderTooltipHeader.bind(this);
        this.renderDefaultHeader = this.renderDefaultHeader.bind(this);
        this.setTableRef = this.setTableRef.bind(this);
        this.setTableWrapRef = this.setTableWrapRef.bind(this);
        this.closeBubble = this.closeBubble.bind(this);
        this.scrolled = this.scrolled.bind(this);

        this.stopped = debounce(() => this.scrollHeader(true), DEBOUNCE_SCROLL_STOP);
    }

    componentDidMount() {
        // eslint-disable-next-line react/no-find-dom-node
        this.table = ReactDOM.findDOMNode(this.tableRef);
        this.header = this.table.querySelector('.fixedDataTableRowLayout_rowWrapper');

        if (this.isSticky(this.props.stickyHeader)) {
            this.setListeners('add');
            this.scrolled();
            this.checkTableDimensions();
        }
    }

    componentWillReceiveProps(nextProps) {
        const current = this.props;
        const currentIsSticky = this.isSticky(current.stickyHeader);
        const nextIsSticky = this.isSticky(nextProps.stickyHeader);

        if (currentIsSticky !== nextIsSticky) {
            if (currentIsSticky) {
                this.setListeners('remove');
            }
            if (nextIsSticky) {
                this.setListeners('add');
            }
        }
    }

    componentDidUpdate() {
        if (this.isSticky(this.props.stickyHeader)) {
            this.scrollHeader(true);
            this.checkTableDimensions();
        }
    }

    componentWillUnmount() {
        if (this.isSticky(this.props.stickyHeader)) {
            this.setListeners('remove');
        }
    }

    setTableRef(ref) {
        this.tableRef = ref;
    }

    setTableWrapRef(ref) {
        this.tableWrapRef = ref;
    }

    setListeners(action) {
        const method = `${action}EventListener`;
        scrollEvents.forEach(name => window[method](name, this.scrolled));
    }

    setHeader(position = '', x = 0, y = 0) {
        const { style, classList } = this.header;

        classList[position ? 'add' : 'remove']('sticking');
        style.position = position;
        style.left = `${Math.round(x)}px`;
        style.top = `${Math.round(y)}px`;
    }

    getSortFunc(column, index) {
        const { onSortChange } = this.props;
        return partial(onSortChange, column, index);
    }

    getSortObj(column, index) {
        const { sortBy, sortDir } = this.props;
        const { hintSortBy } = this.state;

        const dir = (sortBy === index ? sortDir : null);
        const nextDir = getNextSortDir(column, dir);

        return {
            dir,
            nextDir,
            sortDirClass: getHeaderSortClassName(hintSortBy === index ? nextDir : dir)
        };
    }

    getMouseOverFunc(index) {
        return () => {
            // workaround glitch with fixed-data-table-2,
            // where header styles are overwritten first time user mouses over it
            this.scrolled();

            this.setState({ hintSortBy: index });
        };
    }

    isSticky(stickyHeader) {
        return stickyHeader >= 0;
    }

    checkTableDimensions() {
        if (this.table) {
            const { width, height } = this.state;
            const rect = this.table.getBoundingClientRect();

            if (width !== rect.width || height !== rect.height) {
                this.setState(pick(rect, 'width', 'height'));
            }
        }
    }

    scrollHeader(stopped = false) {
        const { stickyHeader, sortInTooltip, hasHiddenRows } = this.props;
        const boundingRect = this.table.getBoundingClientRect();

        if (!stopped && sortInTooltip && this.state.sortBubble.visible) {
            this.closeBubble();
        }

        if (
            boundingRect.top >= stickyHeader ||
            boundingRect.top < stickyHeader - boundingRect.height
        ) {
            this.setHeader();
            return;
        }

        const headerOffset = DEFAULT_HEADER_HEIGHT + ((hasHiddenRows ? 2 : 1) * DEFAULT_ROW_HEIGHT);

        if (boundingRect.bottom >= stickyHeader &&
            boundingRect.bottom < stickyHeader + headerOffset
        ) {
            this.setHeader('absolute', 0, boundingRect.height - headerOffset);
            return;
        }

        if (stopped) {
            this.setHeader('absolute', 0, stickyHeader - boundingRect.top);
        } else {
            this.setHeader('fixed', boundingRect.left, stickyHeader);
        }
    }

    scrolled() {
        this.scrollHeader();

        // required for Edge/IE to make sticky header clickable
        this.stopped();
    }

    closeBubble() {
        this.setState({
            sortBubble: {
                visible: false
            }
        });
    }

    isBubbleVisible(index) {
        const { sortBubble } = this.state;
        return sortBubble.visible && sortBubble.index === index;
    }

    renderTooltipHeader(column, index, columnWidth) {
        const headerClasses = getHeaderClassNames(column);
        const bubbleClass = uniqueId('table-header-');
        const cellClasses = classNames(headerClasses, bubbleClass);

        const sort = this.getSortObj(column, index);

        const columnAlign = getColumnAlign(column);
        const alignPoints = getTooltipSortAlignPoints(columnAlign);

        const getArrowPositions = () => {
            return calculateArrowPositions({
                width: columnWidth,
                align: columnAlign,
                index
            }, this.tableRef.state.scrollX, this.tableWrapRef);
        };

        const showSortBubble = () => {
            // workaround glitch with fixed-data-table-2
            // where header styles are overwritten first time user clicks on it
            this.scrolled();

            this.setState({
                sortBubble: {
                    visible: true,
                    index
                }
            });
        };

        return props => (
            <span>
                <Cell {...props} className={cellClasses} onClick={showSortBubble}>
                    <span className="gd-table-header-title">
                        {column.title}
                    </span>
                    <span className={sort.sortDirClass} />
                </Cell>
                {this.isBubbleVisible(index) &&
                    <Bubble
                        closeOnOutsideClick
                        alignTo={`.${bubbleClass}`}
                        className="gd-table-header-bubble bubble-light"
                        overlayClassName="gd-table-header-bubble-overlay"
                        alignPoints={alignPoints}
                        arrowDirections={{
                            'bl tr': 'top',
                            'br tl': 'top',
                            'tl br': 'bottom',
                            'tr bl': 'bottom'
                        }}
                        arrowOffsets={{
                            'bl tr': [14, 10],
                            'br tl': [-14, 10],
                            'tl br': [14, -10],
                            'tr bl': [-14, -10]
                        }}
                        arrowStyle={getArrowPositions}
                        onClose={this.closeBubble}
                    >
                        <TableSortBubbleContent
                            activeSortDir={sort.dir}
                            title={column.title}
                            onClose={this.closeBubble}
                            onSortChange={this.getSortFunc(column, index)}
                        />
                    </Bubble>
                }
            </span>
        );
    }

    renderDefaultHeader(column, index) {
        const headerClasses = getHeaderClassNames(column);

        const sort = this.getSortObj(column, index);
        const sortFunc = this.getSortFunc(column, index);

        const onClick = e => sortFunc(sort.nextDir, e);
        const onMouseEnter = this.getMouseOverFunc(index);
        const onMouseLeave = this.getMouseOverFunc(null);

        return props => (
            <Cell
                {...props}
                className={headerClasses}
                onClick={onClick}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
            >
                <span className="gd-table-header-title" title={column.title}>{column.title}</span>
                <span className={sort.sortDirClass} />
            </Cell>
        );
    }

    renderCell(column, index) {
        const { sortBy } = this.props;
        const isSorted = sortBy === index;
        return (cellProps) => {
            const { rowIndex, columnKey } = cellProps;

            const content = this.props.rows[rowIndex][columnKey];
            const classes = getCellClassNames(rowIndex, columnKey, isSorted);

            const { style, label } = getStyledLabel(column, content);

            return (
                <Cell {...cellProps}>
                    <span className={classes} style={style} title={label}>{label}</span>
                </Cell>
            );
        };
    }

    renderColumns(columnWidth) {
        const renderHeader =
            this.props.sortInTooltip ? this.renderTooltipHeader : this.renderDefaultHeader;

        return this.props.headers.map((column, index) =>
            <Column
                key={`${index}.${column.id}`}
                width={columnWidth}
                align={getColumnAlign(column)}
                columnKey={index}
                header={renderHeader(column, index, columnWidth)}
                cell={this.renderCell(column, index)}
                allowCellsRecycling
            />
        );
    }

    render() {
        const {
            headers,
            containerWidth,
            containerHeight,
            containerMaxHeight,
            stickyHeader,
            hasHiddenRows
        } = this.props;
        const columnWidth = Math.max(containerWidth / headers.length, MIN_COLUMN_WIDTH);
        const isSticky = this.isSticky(stickyHeader);

        const height = containerMaxHeight ? undefined : containerHeight || DEFAULT_HEIGHT;
        const componentClasses =
            classNames('indigo-table-component', { 'has-hidden-rows': hasHiddenRows });
        const componentContentClasses =
            classNames('indigo-table-component-content', { 'has-sticky-header': isSticky });

        return (
            <div className={componentClasses}>
                <div className={componentContentClasses} ref={this.setTableWrapRef}>
                    <Table
                        ref={this.setTableRef}
                        touchScrollEnabled
                        headerHeight={DEFAULT_HEADER_HEIGHT}
                        rowHeight={DEFAULT_ROW_HEIGHT}
                        rowsCount={this.props.rows.length}
                        width={containerWidth || DEFAULT_WIDTH}
                        maxHeight={containerMaxHeight}
                        height={height}
                        onScrollStart={this.closeBubble}
                    >
                        {this.renderColumns(columnWidth)}
                    </Table>
                </div>
                {isSticky ? (
                    <div
                        className="indigo-table-background-filler"
                        style={{ ...pick(this.state, 'width', 'height') }}
                    />
                ) : false}
            </div>
        );
    }
}
