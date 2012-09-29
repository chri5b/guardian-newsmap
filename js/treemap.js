var treemapInput;
var treemap = d3.layout.treemap()
var headlineSVG = d3.select('#headlineContent').append('svg');
var daysBack = 7;
var numRefinements = 31;
var latestStoryID = null;
var modalDialogue = null;
var headlineItems;
var headlineData;
var currentAvailableSpace = $("#headlineContent").width();
var opts = {
  lines: 9, // The number of lines to draw
  length: 8, // The length of each line
  width: 4, // The line thickness
  radius: 10, // The radius of the inner circle
  corners: 1, // Corner roundness (0..1)
  rotate: 0, // The rotation offset
  color: '#444', // #rgb or #rrggbb
  speed: 1, // Rounds per second
  trail: 78, // Afterglow percentage
  shadow: false, // Whether to render a shadow
  hwaccel: false, // Whether to use hardware acceleration
  className: 'spinner', // The CSS class to assign to the spinner
  zIndex: 2e9, // The z-index (defaults to 2000000000)
  top: 'auto', // Top position relative to parent in px
  left: 'auto' // Left position relative to parent in px
};
var target;
var spinner;
var animating = false;
var retries = 0;

$(document).ready(function(){   

    target = document.getElementById('loading');
    spinner = new Spinner(opts).spin(target);
    
    $(".chzn-select").chosen({disable_search:true}) 
    
    $(".chzn-select").chosen().change( function(event) {
        daysBack = event.target.selectedOptions[0].id;
            
        searchGuardianContent(numRefinements,daysBack,getCurrentTopic());
    });

    updateBreadcrumb(null,null,null);
    
    //search for all content on page load
    searchGuardianContent(numRefinements,daysBack,getCurrentTopic());
});

// Revert to a previously saved state
window.addEventListener('popstate', function(event) {
  if (event.state != null) {
      var UrlDecoded = event.state.replace('_','/');
      searchGuardianContent(numRefinements,daysBack,UrlDecoded);
  }
});

function searchGuardianContent(refinementSize,daysBack,tag) {
    topic = tag;
    animating = true;
    spinner.spin(target);
    
    //calculate dates
    var endDate = new Date();
    var today = ISODateString(endDate);
    var startDate = new Date()
    startDate.setDate(endDate.getDate()-daysBack);
    var end = ISODateString(startDate);


    //make the request to the Guardian webservice
    $.ajax({
        type:"GET",
        url: "http://content.guardianapis.com/search?format=json&show-refinements=keyword",
        data: {
            "from-date":end,
            "to-date":today,
            "refinement-size":refinementSize,
            "tag":tag,
            "show-tags":"keyword",
            "showFields":"standfirst",
            "api-key":"64csjubx7sgasejbnaspru3a",
            "page-size":25
            },
        dataType:"jsonp",
        success: function(data) {
            retries = 0;
            var jsonResponse = data;
            
            if(jsonResponse.response.pages==0)
            {
                //there are no results.
                spinner.stop();
                
                $.modal("<div><h1>Error</h1><p>There are no stories for the topic and timeperiod you specified. Please try a different request.</p></div>");
            }
            else
            {
                treemapInput = jsonResponse.response.refinementGroups[0].refinements;
                treemapInput = removeRootTopic(treemapInput,tag);
                
                tagDescription = getTagDescription(tag,data);
                var section = getSection(tag,data);
                //update the header
                updateHeader(tag,tagDescription);            
                //pass the data to the r3 to draw the heatmap
                updateBreadcrumb(section,tag, tagDescription);
                drawHeatmap(treemapInput);
                //update headlines
                showHeadlines(jsonResponse.response.results);
                spinner.stop();
            }
        },
        error: function(errorData,errorCode) {
            handleSearchRequestError(refinementSize,daysBack,tag,errorData,errorCode);
        }
    });

    //tell google analytics which topic has been requested
    _gaq.push(['_setCustomVar',
      1,                   // This custom var is set to slot #1.  Required parameter.
      'Tag',           // The top-level name for your online content categories.  Required parameter.
      tag,  // Sets the value of "Section" to "Life & Style" for this particular aricle.  Required parameter.
      3                    // Sets the scope to page-level.  Optional parameter.
      ]);
    _gaq.push(['_trackEvent',
      'Action', // category of activity
      'Searched', // Action
    ]);


}

function removeRootTopic(treemapData, topic) {
    //This method removes the topic which was originally requested because it takes up a lot of room in the heatmap and can't be used to filter
    
    filteredTreemapData = $(treemapData).filter(function () {
            return this.id != topic;
        });
        
    return filteredTreemapData;    

}

function handleSearchRequestError(refinementSize,daysBack,errorData,errorCode) {
    
        console.log("error occurred");
        console.log(errorData);
    //if its the first error retry
    if (retries == 0)
    {
        console.log("retrying");
        retries += 1;
        searchGuardianContent(refinementSize,daysBack,tag);
    }
    else
    {
    //if its the second error update display to communicate that an error has occurred
                $("#topicSpan").html(" ");
                $("#heatmapContent").empty();
                headlineSVG.selectAll("a").remove();
                $.modal("<div><h1>Error</h1><p>The management is very sorry but an " + errorCode.toString() + "error has occurred</p></div>");
                spinner.stop();
    }
}

function updateHeader(tag,tagDescription) {
    if (tagDescription != undefined || tagDescription != null) 
    {
       $("#topicSpan").html(" " + tagDescription);
    }
    else
    {
        $("#topicSpan").html(" ");
    }
    if (tag != undefined || tag != null)
    {
       var urlEncoded = tag.toString()
       urlEncoded = urlEncoded.replace('/','_');
       history.pushState(urlEncoded,"tag","?tag="+ urlEncoded)   
    }
    else
    {
       
       history.pushState(null,"tag","?tag="); 
    }
}

function showHeadlines(headlines) {

    headlineData = headlines;
    
    headlineItems = headlineSVG.selectAll('a')
        .data(headlines, function(d) { return d.webUrl; });
        
    //remove headlines which aren't needed    
    headlineItems.exit()
        .transition()
            .duration(50)
            .attr("fill","#000000")
        .remove();
    
    //change the y position of headlines which are common
    headlineItems.transition()
            .duration(400)
            .delay(100)
            .select('text')
                .attr("y",(function(d,i) {return (i+1)*20; }));
      
    //            .attr("xlink:href",function(d) { return d.webUrl; })          
    //load the headlines black and transparent and transition them to the correct fill
    headlineItems.enter()
        .append("svg:a")
            .attr("id",function(d) {return d.webUrl.replace(/[\/\:\.]/g,''); } )

            .attr("class", "hasTip")
            .attr("onmouseover", function(d) { return "$('#" + d.webUrl.replace(/[\/\:\.]/g,'') + "').tooltip({showURL:false,bodyHandler:function(d) { return '" + $('<div/>').html(d.fields.standfirst).text().replace(/\'/g,'&apos;') + "'; }})"})
            .attr("onclick", function(d) { return "getGuardianStory('" + d.id + "')"; })
        .append("svg:text")
            .attr("x",20)
            .attr("y",(function(d,i) {return (i+1)*20; }))
            .attr("text-anchor","start")
            .attr("fill","rgba(0,0,0,0)")
            .attr("class", "headline")
            .text(function(d) { return d.webTitle; })
        .transition()
            .delay(550)
            .duration(50)            
            .attr("fill","#E2E1DF")
            .each("end",function() { animating=false; });

    trimHeadlines(headlineData);
    resize();
}

function drawHeatmap(heatmapInput) {

    $("#heatmapContent").empty();
    
    var width = getHeatmapSize().heatmapwidth,
        height = getHeatmapSize().heatmapheight,
        color = d3.scale.category20c();

    $("#heatmap").attr("style", "max-width:"+ width + "px");
    
    treemap
        .size([width, height])
        .sticky(false)
        .value(function(d) { return d.count; });
        
    
    var heatmapDiv = d3.select("#heatmapContent").append("div")
        .style("position", "relative")
        .style("max-width", width + "px")
        .style("height", height + "px");

    var p = heatmapDiv.datum({children: heatmapInput}).selectAll("div")
          .data(treemap.nodes);
          
    p.enter()
            .append("div")
            .attr("class", "cell")
            .attr("onClick", function(d) { return "searchGuardianContent("+numRefinements+","+daysBack+",'" + d.id + "')"; })
            .on("mouseover", function(d) { updateHeadlineShading(d.id); })
            .on("mouseout", function(d) { updateHeadlineShading(null); })
            .style("background", function(d) { return color(d.id); })
            .call(cell)
            .text(function(d) { return d.displayName; });

    p.exit()
            .remove();
    
        
        
}

function cell() {
  this
      .style("left", function(d) { return d.x + "px"; })
      .style("top", function(d) { return d.y + "px"; })
      .style("width", function(d) { return Math.max(0, d.dx - 1) + "px"; })
      .style("height", function(d) { return Math.max(0, d.dy - 1) + "px"; });
}

function ISODateString(d){
  function pad(n){return n<10 ? '0'+n : n}
  return d.getUTCFullYear()+'-'
      + pad(d.getUTCMonth()+1)+'-'
      + pad(d.getUTCDate());
}

function getGuardianStory(storyID) {
    latestStoryID = storyID;
    $.ajax({
        type:"GET",
        url: "http://content.guardianapis.com/" + storyID,
        data: {
            "format":"json",
            "api-key":"64csjubx7sgasejbnaspru3a",
            "show-fields":"byline,thumbnail,headline,body"
            },
        dataType:"jsonp",
        success: function(data) {
            $("#storyHeadline").html(data.response.content.webTitle);
            if (data.response.content.fields.body == undefined)
            {
                $("#storyBody").html("<p>There is no content for this storyplease go to the Guardian site to read it by clicking <a href='" + data.response.content.webUrl + "'>here</a></p>");
            }
            else
            {
                if (data.response.content.fields.body.indexOf("Redistribution rights for this field are unavailable") > 0)
                {
                    $("#storyBody").html("<p>Redistribution is not allowed for this story - please go to the Guardian site to read it by clicking <a href='" + data.response.content.webUrl + "'>here</a></p>");
                }
                else
                {
                    $("#storyBody").html(data.response.content.fields.body);                
                }
            }

            $("#storyByline").html(data.response.content.fields.byline);
            $("#storyDate").html(moment(data.response.content.webPublicationDate).fromNow());
            $("#storyThumbnail").html("<img src='" + data.response.content.fields.thumbnail + "'></img>");
            $("#story").modal({
                closeHTML: "<a href='#'></a>",
                close:true,
                overlayClose:true,
                autoPosition:true,
                autosize:true
            });
        }
    });
    _gaq.push(['_trackEvent',
      'Action', // category of activity
      'ReadStory', // Action
    ]);
}

function updateHeadlineShading(topic) {
    headlineItems
        .select("text")
            .attr("fill",function(d) { 
                if (topic == null || animating==true)
                    {
                        return "#e2e1df";
                    }
                    else
                    {
                        if (d.tags.some(function topicMatches(element,index,array) { return element.id == topic; })) 
                            {
                                return "#efefef"; 
                            } 
                            else 
                            { 
                                return "#888888" ;
                            } 
                    }
            });
}



$(window).resize(function() {
    resize();
});

function resize() {
    //empty the heatmap div
    $("#heatmapContent").empty();
    
    //redraw heatmap
    drawHeatmap(treemapInput);
    
    $("#headlines").width("");
    //make the headline title take the same vertical space as the heatmap title
    $("#headlineTitle").height($("#heatmapTitle").height());
    
    //retrieve headline dimensions
    var headlineHeight = getHeatmapSize().headlineheight;
    var headlineWidth = getHeatmapSize().headlinewidth;
    
    $("#headlineContent")
        .height(headlineHeight)
        .width(headlineWidth); 
        
    //required for Firefox
    headlineSVG
        .style("width",headlineWidth + "px")
        .style("height",headlineHeight + "px");
            
    //calculate how much space there is 
    currentAvailableSpace = $("#headlineContent").width();
    
    //replace extraeneous text with ellipsis on headlines
    trimHeadlines(headlineData);
    
    //resize the story if it is displayed.
    if ($("#story").style != "display:none") 
    {
        $("#simplemodal-container")
            .height($(window).height()/10*8)
            .width($(window).width()/10*7);  
    }


}

function trimHeadlines(headlineData) {
    $.each($("text"),function(index,value) { 
        //reset text value to the full headline (in case we're making the available space bigger)
        value.textContent = findFullHeadline(value.textContent);
        
        //value.textContent = value.textContent.replace(/&amp;/g," ");
        //see if it fits
        var spaceToContentRatio = currentAvailableSpace / value.getComputedTextLength();
        //if its a tight fit
        if (spaceToContentRatio < 1.2 && value.textContent != undefined) { 
            // trim the text, leaving space for the ellipsis
            value.textContent = value.textContent.substr(0,(value.textContent.length * spaceToContentRatio * 0.95)-4); 
            // add the ellipsis
            value.textContent = value.textContent + "...";
            } 
    });
}

function findFullHeadline(startOfHeadline) {
    var matches = $(headlineData).filter(function(index) { 
        //need to match the headline based on what's left of it, ignoring the ellipsis.
        var encodedWebTitle = this.webTitle.replace(/&amp;/g, '&');
        encodedWebTitle = encodedWebTitle.replace(/&nbsp;/g, " ");
        var encodedStartHeadline = startOfHeadline.replace(/&amp;/g, '&');
        encodedStartHeadline = encodedStartHeadline.replace(/&apos;/g, "'");
        //console.log(encoded);
        return encodedWebTitle.substring(0,encodedStartHeadline.length-3) == encodedStartHeadline.substring(0,encodedStartHeadline.length-3);
    });
    
    if (matches.length > 0)
    {
        var decoded = matches[0].webTitle.replace(/&amp;/g, '&');
        return decoded;
    }
    else 
    {
        //console.log("couldn't find full headline for " + startOfHeadline);
        return "";
    }
    
}

function getCurrentTopic() {
    var currentTopic = $.url().param('tag');
    if (currentTopic != null) { currentTopic = currentTopic.replace('_','/') }
    return currentTopic;
}

function getTagDescription(tag,data) {
    var matches = $(data.response.refinementGroups[0].refinements).filter(function (index) {
        return this.id == tag;
    });
    
    if (matches.length > 0)
    {
        return matches[0].displayName;
    }
    else 
    {
        return null;
    }
}

function getSection(tag,data) {
    var matches = $(data.response.refinementGroups[0].refinements).filter(function (index) {
        return this.id == tag;
    });
    
    if (matches.length > 0)
    {
        return matches[0].id.substring(0,matches[0].id.indexOf("/"));
    }
    else 
    {
        return null;
    }
}

function getHeatmapSize() {
    var windowHeight = $(window).height();
    var windowWidth = $(window).width();
    var goldenRatio = 1.618;
    var heatmapHeight;
    var heatmapWidth;
    var headlineWidth;
    var orientation;
    var result = {heatmapheight:0,heatmapwidth:0,headlineheight:0,headlinewidth:0}; 
    var constraint;
    
    
    if (windowHeight > windowWidth * 2/3)
    {
        orientation = "portrait";
        if ( windowHeight * goldenRatio > windowWidth / 2)
        {
            constraint = "height";
            heatmapHeight = (windowHeight * 0.80) - 100;
            heatmapWidth = (heatmapHeight / goldenRatio) - 50;
            headlineWidth = (windowWidth - heatmapWidth) - 75;
        }
        else
        {
            constraint = "width";
            heatmapWidth = (windowWidth / 2) - 50;
            heatmapHeight = heatmapWidth * goldenRatio;
            headlineWidth = heatmapWidth - 50;
        }

    }
    else
    {
        orientation = "landscape";
        if ( windowHeight > windowWidth * 2/3 * goldenRatio )
        {
            constraint = "width";
            heatmapWidth = (windowWidth * 2/3) - 50;
            heatmapHeight = heatmapWidth / goldenRatio;
            headlineWidth = (windowWidth - heatmapWidth) - 50;
        }
        else
        {
            constraint = "height";
            heatmapHeight = (windowHeight * 0.80) - 100;
            heatmapWidth = heatmapHeight * goldenRatio - 50;
            headlineWidth = (windowWidth - heatmapWidth) - 100;
        }
 
    }
    result.heatmapheight = heatmapHeight;
    result.heatmapwidth = heatmapWidth;
    result.headlineheight = heatmapHeight;
    result.headlinewidth = headlineWidth;

    return result;
}

function displayInfo() {
    $("#infoLink")
        .tooltip({
            "showURL":false,
            "opacity":0.95,
            "bodyHandler": function() {
                return "<h2>What am I looking at?</h2><p>The newsmap shows the 30 topics most frequently associated with stories published by the Guardian recently. </p><p>The size of each cell in the newsmap is proportional to the number of stories which are tagged with that topic.</p><p>Clicking on a cell makes a new query for stories which are tagged with the topic you clicked on. </p><p>Clicking a headline shows the story if it's available </p><h2>What's the point?</h2><p>I wanted to create something which gives an overview of the topics which have been in the news recently, <br> and which makes it possible to discover stories which you wouldn't necessarily have seen otherwise</p><h2>What did you use to create it?</h2><p>Firstly the data comes from the Guardian Open Platform API, and the visualisation is enabled by D3, a JavaScript visualisation toolkit. <br>jQuery helps in various places, as do a number of jQuery plugins like Chosen, SimpleModal, Spin, Moment, and Tooltip.</p>";
            }
        });

}

function updateBreadcrumb (section,topic,topicDescription) {
    // If topic is null there is no need for a breadcrumb at all
    if (section == null) 
    {
        console.log("topic is null");
        $("#breadcrumb").hide();
    }
    else
    {
        // Otherwise 
        $("#breadcrumbHome").unbind("click").click(function () {
                updateHeader(null,null);
                searchGuardianContent(numRefinements,daysBack,null);
            });
        $("#breadcrumbSection").unbind("click").click(function () {
                searchGuardianContent(numRefinements,daysBack,section+"/"+section);;
                });
        $("#breadcrumbSection").html(section);
        $("#breadcrumb").show();        
    }
}